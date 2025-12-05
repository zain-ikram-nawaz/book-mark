// import { NextResponse } from "next/server";

// export async function GET(request) {
//     // Token ko Request Header se nikalo
//     const authHeader = request.headers.get('Authorization');
//     const token = authHeader?.split(' ')[1]; // Expecting "Bearer <token>"

//     const { searchParams } = new URL(request.url);
//     const folderId = searchParams.get("folderId");

//     if (!token || !folderId) {
//         return NextResponse.json(
//             { data: [], error: "Authorization Token or folderId missing." },
//             { status: 401 }
//         );
//     }

//     try {
//         const res = await fetch(`https://api.clickup.com/api/v2/folder/${folderId}/list`, {
//             headers: { Authorization: `Bearer ${token}` },
//         });

//         if (res.status === 401) {
//              return NextResponse.json({ data: [], error: "Token is invalid or expired. Re-authentication required." }, { status: 401 });
//         }

//         const data = await res.json();
//         return NextResponse.json({ data: data.lists || [] });
//     } catch (err) {
//         console.error("Error fetching lists:", err);
//         return NextResponse.json({ data: [], error: err.message }, { status: 500 });
//     }
// }