import { test } from "node:test";
import assert from "node:assert/strict";
import { IndexedDBAdapter } from "./indexeddb-adapter";

type Callback = (() => void) | null;
function mockDatabase() {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
	const request: {
		onsuccess: Callback;
		onerror: Callback;
		error: DOMException | null;
	} = { onsuccess: null, onerror: null, error: null };
	let closed = false;
	const transaction: {
		oncomplete: Callback;
		onabort: Callback;
		onerror: Callback;
		error: DOMException | null;
		objectStore: () => object;
	} = {
		oncomplete: null,
		onabort: null,
		onerror: null,
		error: null,
		objectStore: () => ({
			put: () => request,
			delete: () => request,
			clear: () => request,
		}),
	};
	const openRequest: {
		onsuccess: Callback;
		onerror: Callback;
		error: null;
		result: object;
	} = {
		onsuccess: null,
		onerror: null,
		error: null,
		result: {
			transaction: () => transaction,
			close: () => {
				closed = true;
			},
		},
	};
	Object.defineProperty(globalThis, "indexedDB", {
		configurable: true,
		value: {
			open: () => {
				queueMicrotask(() => openRequest.onsuccess?.());
				return openRequest;
			},
		},
	});
	return {
		adapter: new IndexedDBAdapter<{ name: string }>({
			dbName: "commit-test",
			storeName: "projects",
		}),
		request,
		transaction,
		isClosed: () => closed,
		restore() {
			if (descriptor)
				Object.defineProperty(globalThis, "indexedDB", descriptor);
			else Reflect.deleteProperty(globalThis, "indexedDB");
		},
	};
}

test("writes do not report durable success at request success, only at transaction commit", async () => {
	const database = mockDatabase();
	try {
		let resolved = false;
		const pending = database.adapter
			.set({ key: "part-1", value: { name: "Part 1" } })
			.then(() => {
				resolved = true;
			});
		await new Promise<void>((resolve) => setImmediate(resolve));
		database.request.onsuccess?.();
		await Promise.resolve();
		assert.equal(resolved, false);
		database.transaction.oncomplete?.();
		await pending;
		assert.equal(resolved, true);
		assert.equal(database.isClosed(), true);
	} finally {
		database.restore();
	}
});

test("a quota abort after request success rejects the project write", async () => {
	const database = mockDatabase();
	try {
		const pending = database.adapter.set({
			key: "part-1",
			value: { name: "Part 1" },
		});
		const rejected = assert.rejects(pending, { name: "QuotaExceededError" });
		await new Promise<void>((resolve) => setImmediate(resolve));
		database.request.onsuccess?.();
		database.transaction.error = new DOMException(
			"Storage full during commit",
			"QuotaExceededError",
		);
		database.transaction.onabort?.();
		await rejected;
		assert.equal(database.isClosed(), true);
	} finally {
		database.restore();
	}
});

test("rollback deletion and clearing also await the transaction commit", async () => {
	for (const operation of ["remove", "clear"] as const) {
		const database = mockDatabase();
		try {
			let resolved = false;
			const pending = (
				operation === "remove"
					? database.adapter.remove("part-1")
					: database.adapter.clear()
			).then(() => {
				resolved = true;
			});
			await new Promise<void>((resolve) => setImmediate(resolve));
			database.request.onsuccess?.();
			await Promise.resolve();
			assert.equal(resolved, false);
			database.transaction.oncomplete?.();
			await pending;
			assert.equal(resolved, true);
		} finally {
			database.restore();
		}
	}
});
