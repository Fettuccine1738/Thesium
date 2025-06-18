import { NextResponse } from "next/server";
import { getProfessorsWs } from "@/app/backend/actions/professors/get-professors_1";

export async function GET() {
  const result = await getProfessorsWs();
  return NextResponse.json(result);
}