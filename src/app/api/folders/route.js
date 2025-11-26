import { NextResponse } from "next/server";

export async function GET(request) {
    // Token ko Request Header se nikalo
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1]; // Expecting "Bearer <token>"

    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get("spaceId");

    if (!token || !spaceId) {
        return NextResponse.json(
            { data: [], error: "Authorization Token or spaceId missing." },
            { status: 401 }
        );
    }

    try {
        const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
             return NextResponse.json({ data: [], error: "Token is invalid or expired. Re-authentication required." }, { status: 401 });
        }

        const data = await res.json();
        return NextResponse.json({ data: data.folders || [] });
    } catch (err) {
        console.error("Error fetching folders:", err);
        return NextResponse.json({ data: [], error: err.message }, { status: 500 });
    }
}