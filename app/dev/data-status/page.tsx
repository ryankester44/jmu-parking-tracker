import { notFound } from "next/navigation";
import { DataStatusClient } from "./DataStatusClient";

export const metadata = { title: "Data Status — JMU Parking Tracker (dev)" };

export default function DataStatusPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DataStatusClient />;
}
