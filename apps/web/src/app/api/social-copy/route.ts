import { NextRequest, NextResponse } from "next/server";
import { generateSocialCopy, SocialCopyRequestSchema } from "@/social-copy/server";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: NextRequest) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
	}
	const input = SocialCopyRequestSchema.safeParse(body);
	if (!input.success) {
		return NextResponse.json({ error: "Nhập nội dung video (tối đa 12.000 ký tự) và tiêu đề tối đa 300 ký tự." }, { status: 400 });
	}
	try {
		return NextResponse.json(await generateSocialCopy({ input: input.data, signal: request.signal }));
	} catch (error) {
		const message = error instanceof Error ? error.message : "Không thể tạo caption. Vui lòng thử lại.";
		return NextResponse.json({ error: message }, { status: 502 });
	}
}
