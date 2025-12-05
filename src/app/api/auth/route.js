import { NextResponse } from "next/server";

const CLIENT_ID = process.env.NEXT_PUBLIC_CLICKUP_CLIENT_ID;
const CLIENT_SECRET = process.env.CLICKUP_CLIENT_SECRET;
const REDIRECT_URI = process.env.NEXT_PUBLIC_CLICKUP_REDIRECT_URI;

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
        return NextResponse.json({ error: "Missing authorization code." }, { status: 400 });
    }

    try {
        // Exchange code for access token
        const tokenRes = await fetch("https://api.clickup.com/api/v2/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code,
            }),
        });

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok) {
            return NextResponse.json({ error: tokenData }, { status: tokenRes.status });
        }

        const accessToken = tokenData.access_token;

        // 🔥 NOW FETCH USER PROFILE (VERY IMPORTANT)
        const userRes = await fetch("https://api.clickup.com/api/v2/user", {
            headers: { Authorization: accessToken },
        });

        const userData = await userRes.json();

        if (!userRes.ok) {
            return NextResponse.json({ error: userData }, { status: userRes.status });
        }

        const clickUpUserId = userData.user.id;

        console.log("ClickUp User ID:", clickUpUserId);

        // Send token + user ID back to frontend
        const redirectUrl = `/?access_token=${accessToken}&cu_user_id=${clickUpUserId}`;

        return NextResponse.redirect(new URL(redirectUrl, request.url));

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
