import { NextResponse } from "next/server";

export async function GET(request) {
    // Token ko Request Header se nikalo
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1]; // Expecting "Bearer <token>"

    const teamId = process.env.TEAM_ID;

    if (!token || !teamId) {
        return NextResponse.json({ data: [], error: "Authorization Token or TEAM_ID missing. Please re-authenticate." }, { status: 401 });
    }

    try {
        const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
             return NextResponse.json({ data: [], error: "Token is invalid or expired. Re-authentication required." }, { status: 401 });
        }

        const data = await res.json();
        return NextResponse.json({ data: data.spaces || [] });
    } catch (err) {
        return NextResponse.json({ data: [], error: err.message }, { status: 500 });
    }
}