import { NextResponse } from "next/server";

// OAuth credentials and redirect URI environment variables se lenge
// CLIENT_ID, CLIENT_SECRET, REDIRECT_URI must be set in your .env.local
const CLIENT_ID = process.env.NEXT_PUBLIC_CLICKUP_CLIENT_ID;
const CLIENT_SECRET = process.env.CLICKUP_CLIENT_SECRET;
const REDIRECT_URI = process.env.NEXT_PUBLIC_CLICKUP_REDIRECT_URI;

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
        return NextResponse.json(
            { error: "Missing authorization code from ClickUp. User may have denied access." },
            { status: 400 }
        );
    }

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
        console.error("Missing OAuth environment variables (CLIENT_ID, CLIENT_SECRET, or REDIRECT_URI).");
        return NextResponse.json(
            { error: "Server configuration error: ClickUp OAuth credentials missing." },
            { status: 500 }
        );
    }

    try {
        console.log("Exchanging authorization code for Access Token...");

        // ClickUp's Token Exchange Endpoint
        const tokenRes = await fetch("https://api.clickup.com/api/v2/oauth/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: code,
            }),
        });

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok || tokenData.err) {
            console.error("ClickUp Token Exchange Failed:", tokenData.err || tokenData);
            return NextResponse.json(
                { error: `Failed to obtain Access Token: ${tokenData.error || tokenData.err}` },
                { status: tokenRes.status || 500 }
            );
        }

        const accessToken = tokenData.access_token;
        console.log("Access Token received successfully.");

        // User ko wapas frontend ke root par redirect karo, jahan token URL mein shamil hoga.
        const frontendRedirectUrl = `/?access_token=${accessToken}`;

        return NextResponse.redirect(new URL(frontendRedirectUrl, request.url));

    } catch (err) {
        console.error("Error during OAuth token exchange:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}