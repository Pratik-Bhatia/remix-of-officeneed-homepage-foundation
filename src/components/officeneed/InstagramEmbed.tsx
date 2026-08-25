import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface InstagramEmbedProps {
  url: string;
  className?: string;
}

declare global {
  interface Window {
    instgrm?: {
      Embeds: {
        process: () => void;
      };
    };
  }
}

export function InstagramEmbed({ url, className }: InstagramEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Strip query parameters for a clean permalink
  const cleanUrl = url.split("?")[0];

  useEffect(() => {
    // Inject the Instagram embed script if it doesn't exist
    if (!document.getElementById("instagram-embed-script")) {
      const script = document.createElement("script");
      script.id = "instagram-embed-script";
      script.src = "https://www.instagram.com/embed.js";
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        if (window.instgrm?.Embeds) {
          window.instgrm.Embeds.process();
        }
      };
      
      document.body.appendChild(script);
    } else {
      // If script already exists, trigger processing directly
      if (window.instgrm?.Embeds) {
        window.instgrm.Embeds.process();
      }
    }
  }, [url]);

  return (
    <div 
      ref={containerRef} 
      className={cn(
        "w-full max-w-[400px] mx-auto flex-shrink-0 snap-center flex justify-center bg-transparent",
        className
      )}
    >
      <blockquote
        className="instagram-media"
        data-instgrm-permalink={`${cleanUrl}?utm_source=ig_embed&utm_campaign=loading`}
        data-instgrm-version="14"
        style={{
          background: "#FFF",
          border: 0,
          borderRadius: "4px",
          boxShadow: "0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15)",
          margin: "1px",
          maxWidth: "540px",
          minWidth: "326px",
          padding: 0,
          width: "calc(100% - 2px)",
        }}
      >
        <div style={{ padding: "16px" }}>
          <a
            href={`${cleanUrl}?utm_source=ig_embed&utm_campaign=loading`}
            style={{
              background: "#FFFFFF",
              lineHeight: 0,
              padding: "0 0",
              textAlign: "center",
              textDecoration: "none",
              width: "100%",
              display: "block",
            }}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
              <div
                style={{
                  backgroundColor: "#F4F4F4",
                  borderRadius: "50%",
                  flexGrow: 0,
                  height: "40px",
                  marginRight: "14px",
                  width: "40px",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
                <div style={{ backgroundColor: "#F4F4F4", borderRadius: "4px", flexGrow: 0, height: "14px", marginBottom: "6px", width: "100px" }} />
                <div style={{ backgroundColor: "#F4F4F4", borderRadius: "4px", flexGrow: 0, height: "14px", width: "60px" }} />
              </div>
            </div>
            <div style={{ padding: "19% 0" }} />
            <div style={{ display: "block", height: "50px", margin: "0 auto 12px", width: "50px" }}>
              {/* Fake play button placeholder while loading */}
            </div>
            <div style={{ paddingTop: "8px" }}>
              <div style={{ color: "#3897f0", fontFamily: "Arial,sans-serif", fontSize: "14px", fontStyle: "normal", fontWeight: 550, lineHeight: "18px" }}>
                View this post on Instagram
              </div>
            </div>
            <div style={{ padding: "12.5% 0" }} />
          </a>
        </div>
      </blockquote>
    </div>
  );
}
