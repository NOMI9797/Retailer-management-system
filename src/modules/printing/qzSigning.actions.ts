"use server";

import { createSign } from "crypto";
import { getCurrentShopId } from "@/lib/tenant";

// QZ Tray asks "Allow this website to print?" on every connection
// unless each request is signed with a key whose certificate QZ Tray
// on that computer trusts (installed there as override.crt). Both are
// optional: with QZ_CERTIFICATE / QZ_PRIVATE_KEY unset, these return
// null and printing still works, just with that prompt.
//
// Env values may be stored with literal "\n" escapes (a multi-line PEM
// pasted into a single-line env var), so those are expanded back.
function readPem(value: string | undefined) {
  return value ? value.replace(/\\n/g, "\n").trim() : null;
}

export async function getQzCertificate(): Promise<string | null> {
  await getCurrentShopId();
  return readPem(process.env.QZ_CERTIFICATE);
}

// Requires a signed-in shop user, so this can't be used by anyone on
// the internet as an open signing service for the shop's key.
export async function signQzRequest(toSign: string): Promise<string | null> {
  await getCurrentShopId();
  const privateKey = readPem(process.env.QZ_PRIVATE_KEY);
  if (!privateKey) return null;

  const signer = createSign("SHA512");
  signer.update(toSign);
  return signer.sign(privateKey, "base64");
}
