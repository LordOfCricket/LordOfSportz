import { ImageResponse } from "next/og";
import { sports } from "@/data/sports";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const sportNames = sports.map((sport) => sport.name).join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0a0a0b",
          color: "#f5f5f4",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 6,
            color: "#4ade80",
            textTransform: "uppercase",
          }}
        >
          {sportNames}
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 96, fontWeight: 800, lineHeight: 1.02, marginTop: 24 }}>
          <span>ONE PLACE.</span>
          <span style={{ color: "#4ade80" }}>EVERY SPORT.</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
