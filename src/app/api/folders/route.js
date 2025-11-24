import { NextResponse } from "next/server";

export async function GET(request) {
  const token = process.env.CLICKUP_TOKEN;
  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get("spaceId");

  if (!token || !spaceId) {
    return NextResponse.json(
      { data: [], error: "Missing CLICKUP_TOKEN or spaceId" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder`, {
      headers: { Authorization: token },
    });
    const data = await res.json();
    return NextResponse.json({ data: data.folders || [] });
  } catch (err) {
    console.error("Error fetching folders:", err);
    return NextResponse.json({ data: [], error: err.message }, { status: 500 });
  }
}
