import { NextResponse } from "next/server";

export async function GET(request) {
  const token = process.env.CLICKUP_TOKEN;
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");

  if (!token || !folderId) {
    return NextResponse.json(
      { data: [], error: "Missing CLICKUP_TOKEN or folderId" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`https://api.clickup.com/api/v2/folder/${folderId}/list`, {
      headers: { Authorization: token },
    });
    const data = await res.json();
    return NextResponse.json({ data: data.lists || [] });
  } catch (err) {
    console.error("Error fetching lists:", err);
    return NextResponse.json({ data: [], error: err.message }, { status: 500 });
  }
}
