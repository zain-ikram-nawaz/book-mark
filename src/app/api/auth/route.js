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
        // 1. Exchange code for access token
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
            // Agar yahan Client Secret Mismatch aye tw check karein ke AWS Dashboard aur ClickUp settings match hain
            return NextResponse.json({ error: tokenData }, { status: tokenRes.status });
        }

        const accessToken = tokenData.access_token;

        // 2. Fetch User Profile
        const userRes = await fetch("https://api.clickup.com/api/v2/user", {
            headers: { Authorization: accessToken },
        });

        const userData = await userRes.json();

        if (!userRes.ok) {
            return NextResponse.json({ error: userData }, { status: userRes.status });
        }

        const clickUpUserId = userData.user.id;
        console.log("ClickUp User ID:", clickUpUserId);

        // 3. Absolute Redirect Logic (Fix for localhost issue)
        // Hum REDIRECT_URI (jo ke live URL hai) se base URL nikalenge
        let baseUrl;
        try {
            // Agar REDIRECT_URI = https://site.com/api/callback hai tw ye 'https://site.com' nikal dega
            const urlObj = new URL(REDIRECT_URI);
            baseUrl = urlObj.origin;
        } catch (e) {
            // Fallback agar variable na mile
            baseUrl = "";
        }

        const finalRedirectPath = `${baseUrl}/?access_token=${accessToken}&cu_user_id=${clickUpUserId}`;

        console.log("Redirecting to Absolute URL:", finalRedirectPath);

        // Ab ye hamesha live site par jayega, localhost par nahi
        return NextResponse.redirect(new URL(finalRedirectPath));

    } catch (err) {
        console.error("Auth Error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}