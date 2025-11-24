// /app/api/spaces/route.js
import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.CLICKUP_TOKEN;
  const teamId = process.env.TEAM_ID;

  if (!token || !teamId) {
    return NextResponse.json({ data: [], error: "Missing CLICKUP_TOKEN or TEAM_ID" }, { status: 500 });
  }

  try {
    const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
      headers: { Authorization: token },
    });
    const data = await res.json();
    return NextResponse.json({ data: data.spaces || [] });
  } catch (err) {
    return NextResponse.json({ data: [], error: err.message }, { status: 500 });
  }
}
