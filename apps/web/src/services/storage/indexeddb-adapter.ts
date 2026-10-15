import type { StorageAdapter } from "./types";

export class IndexedDBAdapter<T> implements StorageAdapter<T> {
	private dbName: string;
	private storeName: string;
	private version: number;

	constructor({
		dbName,
		storeName,
		version = 1,
	}: {
		dbName: string;
		storeName: string;
		version?: number;
	}) {
		this.dbName = dbName;
		this.storeName = storeName;
		this.version = version;
	}

	private async getDB(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);

			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					db.createObjectStore(this.storeName, { keyPath: "id" });
				}
			};
		});
	}

	async get(key: string): Promise<T | null> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readonly");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.get(key);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || null);
		});
	}

	async set({ key, value }: { key: string; value: T }): Promise<void> {
		await this.write({
			operation: (store) => store.put({ id: key, ...value }),
		});
	}

	private async write({
		operation,
	}: {
		operation: (store: IDBObjectStore) => IDBRequest;
	}): Promise<void> {
		const db = await this.getDB();
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = db.transaction([this.storeName], "readwrite");
				let requestError: DOMException | null = null;
				transaction.oncomplete = () =>
					requestError ? reject(requestError) : resolve();
				transaction.onabort = () =>
					reject(
						transaction.error ??
							requestError ??
							new DOMException("IndexedDB transaction aborted", "AbortError"),
					);
				const request = operation(transaction.objectStore(this.storeName));
				request.onerror = () => {
					requestError = request.error;
				};
			});
		} finally {
			db.close();
		}
	}

	async remove(key: string): Promise<void> {
		await this.write({ operation: (store) => store.delete(key) });
	}

	async list(): Promise<string[]> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readonly");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.getAllKeys();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result as string[]);
		});
	}

	async getAll(): Promise<T[]> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readonly");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.getAll();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || []);
		});
	}

	async clear(): Promise<void> {
		await this.write({ operation: (store) => store.clear() });
	}
}

export async function deleteDatabase({
	dbName,
}: {
	dbName: string;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(dbName);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}
