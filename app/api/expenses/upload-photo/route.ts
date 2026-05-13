export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

// Requires DB migration: ALTER TABLE expenses ADD COLUMN photo_url text;

export async function POST(req: NextRequest) {
  const db = serverDb();
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const expenseId = formData.get("expense_id") as string | null;

  if (!file || !expenseId) {
    return NextResponse.json({ error: "Missing file or expense_id" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${expenseId}/receipt.${ext}`;

  // Remove any pre-existing files for this expense before uploading the new
  // one — otherwise switching extensions (jpg → png) leaves the old file
  // orphaned in the bucket forever.
  const { data: existing } = await db.storage.from("expense-receipts").list(expenseId);
  if (existing?.length) {
    await db.storage
      .from("expense-receipts")
      .remove(existing.map((f) => `${expenseId}/${f.name}`));
  }

  const { error: uploadError } = await db.storage
    .from("expense-receipts")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = db.storage.from("expense-receipts").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  // Update expense row with photo_url
  const { error: updateError } = await db
    .from("expenses")
    .update({ photo_url: publicUrl })
    .eq("id", expenseId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ photo_url: publicUrl });
}

export async function DELETE(req: NextRequest) {
  const db = serverDb();
  const { searchParams } = new URL(req.url);
  const expenseId = searchParams.get("expense_id");

  if (!expenseId) {
    return NextResponse.json({ error: "Missing expense_id" }, { status: 400 });
  }

  // List files for this expense
  const { data: files } = await db.storage.from("expense-receipts").list(expenseId);
  if (files?.length) {
    await db.storage.from("expense-receipts").remove(files.map((f) => `${expenseId}/${f.name}`));
  }

  // Clear photo_url on expense
  const { error } = await db.from("expenses").update({ photo_url: null }).eq("id", expenseId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
