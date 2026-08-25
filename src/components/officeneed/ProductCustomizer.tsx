import { toast } from "sonner";
import { processLogoServer } from "@/lib/image-processing.functions";
﻿import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Check, Loader2, RotateCw, Move, Pencil, AlertCircle, FlipHorizontal2, FlipVertical2 } from "lucide-react";
import { motion } from "motion/react";
import html2canvas from "html2canvas";
import { submitCorporateQuote } from "@/lib/corporate-quotes.functions";

interface ProductCustomizerProps {
  product: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "customize" | "quote" | "success";



const processLogos = (src: string): Promise<{ uvLogo: string; laserLogo: string }> => {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve({ uvLogo: src, laserLogo: src });
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        const isNearWhite = (r: number, g: number, b: number, a: number) => {
          if (a < 10) return true; 
          return r > 200 && g > 200 && b > 200; // Lowered to 200 to catch grayish JPEG backgrounds
        };
        
        const visited = new Uint8Array(width * height);
        const queue: number[] = [];
        
        // Seed from the outer 10 pixel margin to bypass JPEG artifact borders
        const margin = Math.min(10, Math.floor(width / 2), Math.floor(height / 2));
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (x < margin || x >= width - margin || y < margin || y >= height - margin) {
              const idx = y * width + x;
              if (!visited[idx] && isNearWhite(data[idx * 4]!, data[idx * 4 + 1]!, data[idx * 4 + 2]!, data[idx * 4 + 3]!)) {
                queue.push(idx);
                visited[idx] = 1;
              }
            }
          }
        }
        
        let head = 0;
        while (head < queue.length) {
          const p = queue[head++]!;
          data[p * 4 + 3] = 0;
          
          const px = p % width;
          const py = Math.floor(p / width);
          
          const neighbors: [number, number][] = [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const np = ny * width + nx;
              if (!visited[np]) {
                const nIdx = np * 4;
                if (isNearWhite(data[nIdx]!, data[nIdx+1]!, data[nIdx+2]!, data[nIdx+3]!)) {
                  visited[np] = 1;
                  queue.push(np);
                }
              }
            }
          }
        }
        
        // At this point, the background is removed.
        ctx.putImageData(imageData, 0, 0);
        const uvLogoBase64 = canvas.toDataURL("image/png");
        
        // Now convert remaining artwork to silver
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! > 0) {
            const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            const silverBase = Math.floor(160 + (luminance / 255) * 60);
            data[i] = silverBase;
            data[i + 1] = silverBase;
            data[i + 2] = silverBase;
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
        const laserLogoBase64 = canvas.toDataURL("image/png");
        
        resolve({ uvLogo: uvLogoBase64, laserLogo: laserLogoBase64 });
      } catch (e) {
        resolve({ uvLogo: src, laserLogo: src });
      }
    };
    img.onerror = () => {
      resolve({ uvLogo: src, laserLogo: src });
    };
    img.src = src;
  });
};


export function ProductCustomizer({ product, open, onOpenChange }: ProductCustomizerProps) {
  const [step, setStep] = useState<Step>("customize");
  
  const [logo, setLogo] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoScale, setLogoScale] = useState([50]);
  const [logoRotation, setLogoRotation] = useState([0]);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [uvLogo, setUvLogo] = useState<string | null>(null);
  const [laserLogo, setLaserLogo] = useState<string | null>(null);
  const [isProcessingLaser, setIsProcessingLaser] = useState(false);
  
  

  
  const constraintsRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isSelected, setIsSelected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [logoPos, setLogoPos] = useState({ x: 0, y: 0 }); 
  
  const [formData, setFormData] = useState({
    fullName: "",
    company: "",
    email: "",
    phone: "",
    quantity: "1",
    deliveryDate: "",
    location: "",
    requirements: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refNumber, setRefNumber] = useState("");

  const quantityNum = parseInt(formData.quantity, 10) || 1;
  const printingMethod = quantityNum <= 10 ? "Laser Engraving" : "UV Printing";
  const currentDisplayLogo = printingMethod === "Laser Engraving" ? laserLogo : uvLogo;
  const laserDropShadow = "drop-shadow(0px -1px 0px rgba(0,0,0,0.3)) drop-shadow(0px 1px 1px rgba(255,255,255,0.2))";
  
  const activeMixBlend = "normal";


  const initialPinchRef = useRef<{ dist: number; angle: number; initialScale: number; initialRot: number } | null>(null);

  useEffect(() => {
    if (open) {
      setStep("customize");
      setLogo(null);
      setLogoFile(null);
      setLogoBase64(null);
      setLogoDataUrl(null);
      setLogoScale([50]);
      setLogoRotation([0]);
      setFlipH(false);
      setFlipV(false);
      setIsSelected(false);
      setErrorMsg(null);
      setFormData(prev => ({ ...prev, quantity: "1" }));
    }
  }, [open, product]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload a valid image file (PNG, JPG, SVG).");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File is too large (max 5MB).");
        return;
      }
      
      setLogoFile(file);
      const url = URL.createObjectURL(file);
      setLogo(url);
      setIsSelected(true);
      setLogoPos({ x: 0, y: 0 });
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const result = reader.result as string;
        setLogoDataUrl(result);
        const base64 = result.split(",")[1] ?? "";
        setLogoBase64(base64);
        
        setIsProcessingLaser(true);
        try {
          const res = await processLogoServer({ data: { imageBase64: base64 } });
          if (!res.success) {
            console.error("API returned error:", res.error);
            toast.error("API Error: " + res.error);
            setUvLogo(null);
            setLaserLogo(null);
          } else {
            setUvLogo(res.uvLogoUrl);
            setLaserLogo(res.laserLogoUrl);
            toast.success("Logo processing complete!");
          }
        } catch (error: any) {
          console.error("Failed to process logo:", error);
          toast.error("Network Error: " + (error.message || String(error)));
          setUvLogo(null);
          setLaserLogo(null);
        } finally {
          setIsProcessingLaser(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogo(null);
    setLogoFile(null);
    setLogoBase64(null);
      setLogoDataUrl(null);
      setIsSelected(false);
  };

  const handleResetPosition = () => {
    setLogoPos({ x: 0, y: 0 });
    setLogoRotation([0]);
    setLogoScale([50]);
    setFlipH(false);
    setFlipV(false);
  };

  const submitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    setIsSelected(false); 
    try {
      let previewBase64 = "";
      if (previewContainerRef.current) {
        await new Promise(r => setTimeout(r, 100)); 
        const canvas = await html2canvas(previewContainerRef.current, {
          useCORS: true,
          scale: 1, 
          backgroundColor: "#F9FAFB",
          ignoreElements: (element) => element.classList.contains("no-capture")
        });
        previewBase64 = canvas.toDataURL("image/png");
      }
      const result = await submitCorporateQuote({
        data: {
          fullName: formData.fullName,
          company: formData.company,
          email: formData.email,
          phone: formData.phone,
          quantity: parseInt(formData.quantity, 10),
          deliveryDate: formData.deliveryDate,
          location: formData.location,
          requirements: formData.requirements,
          printingMethod: printingMethod,
          product: {
            id: product.id || product.slug,
            name: product.name,
            variant: product.variants?.[0]?.title
          },
          logo: logoFile && logoBase64 ? {
            name: logoFile.name,
            mimeType: logoFile.type,
            content: logoBase64,
            scale: logoScale[0],
            rotation: logoRotation[0],
            flipH: flipH,
            flipV: flipV,
            x: logoPos.x,
            y: logoPos.y
          } : undefined,
          previewImage: previewBase64
        }
      });
      if (!result.ok) throw new Error(result.error);
      setRefNumber(result.refNumber);
      setStep("success");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to submit quote. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.stopPropagation(); 
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const angle = (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;
      initialPinchRef.current = { dist, angle, initialScale: logoScale[0]!, initialRot: logoRotation[0]! };
    } else {
      initialPinchRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchRef.current) {
      e.preventDefault(); 
      e.stopPropagation();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scaleMultiplier = dist / initialPinchRef.current.dist;
      let newScale = initialPinchRef.current.initialScale * scaleMultiplier;
      newScale = Math.max(15, Math.min(100, newScale));
      setLogoScale([Math.round(newScale)]);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      initialPinchRef.current = null;
    }
  };

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const motionDiv = (e.currentTarget as HTMLElement).parentElement?.parentElement;
    if (!motionDiv) return;
    const rect = motionDiv.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    const startScale = logoScale[0]!;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const dist = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
      const ratio = dist / startDist;
      let newScale = startScale * ratio;
      newScale = Math.max(15, Math.min(100, newScale));
      setLogoScale([newScale]);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsSelected(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-[95vw] p-0 overflow-hidden h-[90vh] max-h-[900px] flex flex-col sm:rounded-2xl">
        {step === "customize" && (
          <div className="flex flex-col lg:flex-row h-full">
            <div 
              className="w-full lg:flex-1 bg-[#F9FAFB] relative flex items-center justify-center p-4 lg:p-12 border-b lg:border-b-0 lg:border-r border-border min-h-[50vh] lg:min-h-full overflow-hidden"
              onClick={handleCanvasClick}
            >
              <div 
                ref={previewContainerRef}
                className="relative w-full h-full max-h-full flex flex-col items-center justify-center bg-[#F9FAFB]"
                onClick={handleCanvasClick}
              >
                <img 
                  src={product.images?.[0] || "https://placehold.co/800x1000/f8f9fa/a1a1aa?text=Product+Image"} 
                  alt="Product preview" 
                  crossOrigin="anonymous"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-sm p-4 lg:p-8"
                />
                
                <div 
                  ref={constraintsRef}
                  className={`absolute inset-0 m-auto w-[55%] h-[65%] transition-all duration-300 pointer-events-none rounded-xl no-capture
                    ${isDragging ? "border-2 border-dashed border-primary/40 bg-primary/5" : "border-2 border-dashed border-transparent"}
                  `}
                />
                
                {logo && (
                  <motion.div 
                    drag 
                    dragConstraints={constraintsRef}
                    dragElastic={0.05}
                    dragMomentum={false}
                    onDragStart={() => {
                      setIsDragging(true);
                      setIsSelected(true);
                    }}
                    onDragEnd={(e, info) => {
                      setIsDragging(false);
                      setLogoPos({ x: info.point.x, y: info.point.y });
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSelected(true);
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    className={`absolute z-10 flex items-center justify-center cursor-move touch-none transition-shadow`}
                    style={{
                      width: `${logoScale[0]}%`,
                      maxWidth: "100%",
                      rotate: logoRotation[0] ?? 0,
                      mixBlendMode: activeMixBlend,
                      touchAction: "none", 
                      opacity: 0.95,
                      x: logoPos.x,
                      y: logoPos.y,
                    }}
                  >
                    {isProcessingLaser ? (
                        <div className="flex flex-col items-center justify-center p-4 bg-background/80 rounded-lg shadow-sm border border-border backdrop-blur-sm">
                          <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                          <span className="text-xs font-medium">Processing Logo...</span>
                        </div>
                      ) : (
                        <img src={currentDisplayLogo || ""} alt="Custom Logo" crossOrigin="anonymous" className="w-full h-auto object-contain pointer-events-none" style={{ transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`, mixBlendMode: activeMixBlend as any, filter: printingMethod === "Laser Engraving" ? laserDropShadow : "drop-shadow(0 4px 6px -1px rgb(0 0 0 / 0.1))" }} />
                      )}
                    
                    {isSelected && (
                      <div className="no-capture absolute inset-0 pointer-events-none">
                        <div className="absolute -inset-[1.5px] border-[1.5px] border-primary pointer-events-none" />
                        <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-nwse-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-nesw-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-nesw-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-nwse-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-1.5 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-ew-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-1.5 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-ew-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-1.5 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-ns-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-1.5 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-ns-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                      </div>
                    )}
                  </motion.div>
                )}
                
                {logo && isSelected && !isDragging && (
                  <div className="no-capture absolute bottom-8 bg-background/90 backdrop-blur-sm border border-border shadow-sm text-xs font-medium px-4 py-2 rounded-full pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                    <span className="hidden sm:inline">Drag logo to position it</span><span className="sm:hidden">Pinch to resize • Drag to position</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="w-full lg:w-[450px] flex flex-col h-full bg-background relative shrink-0">
              <div className="flex-1 overflow-y-auto">
                <div className="p-6 lg:p-8 lg:pb-4">
                  <DialogHeader className="mb-8">
                    <DialogTitle className="text-2xl font-bold tracking-tight">Customize Product</DialogTitle>
                    <DialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      Add your company branding and see how your corporate gift could look.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-10">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</div>
                        <Label className="text-base font-semibold">Add Your Logo</Label>
                      </div>
                      
                      {!logo ? (
                        <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer group">
                          <div className="w-12 h-12 rounded-full bg-background border border-border shadow-sm flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                            <Upload className="w-5 h-5 text-foreground/70" />
                          </div>
                          <span className="text-sm font-medium text-foreground">Upload Logo</span>
                          <span className="text-[13px] text-muted-foreground mt-2 max-w-[240px] leading-relaxed">
                            For best results, use a high-resolution image with a transparent background.
                          </span>
                          <input 
                            type="file" 
                            accept="image/png, image/jpeg, image/svg+xml" 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleLogoUpload}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-3 border border-border rounded-xl bg-background shadow-sm">
                          <div className="flex items-center space-x-4 overflow-hidden">
                            <div className="w-12 h-12 bg-muted/50 rounded-lg p-1.5 border border-border/50 flex items-center justify-center">
                              {isProcessingLaser ? (
                                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                ) : (
                                  <img src={logoDataUrl || undefined} alt="Thumb" className="w-full h-full object-contain" style={{ mixBlendMode: activeMixBlend, filter: printingMethod === "Laser Engraving" ? laserDropShadow : "none" }} />
                                )}
                            </div>
                            <span className="text-sm font-medium truncate max-w-[150px]">{logoFile?.name || "logo.png"}</span>
                          </div>
                          <Button variant="ghost" size="icon" onClick={handleRemoveLogo} className="text-muted-foreground hover:text-destructive h-8 w-8">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className={`space-y-5 transition-opacity duration-300 ${!logo ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</div>
                        <Label className="text-base font-semibold">Position Your Logo</Label>
                      </div>
                      
                      <p className="text-sm text-muted-foreground pl-9">
                        Drag your logo directly onto the product to place it.
                      </p>

                      <div className="pl-9 space-y-6 pt-2">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs font-medium text-foreground/80">Rotation</Label>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {[0, 90, 180].map(angle => (
                              <Button 
                                key={angle}
                                type="button"
                                variant={logoRotation[0] === angle ? "default" : "outline"}
                                className="h-9 font-medium"
                                onClick={() => setLogoRotation([angle])}
                              >
                                {angle}°
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs font-medium text-foreground/80">Flip</Label>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button 
                              type="button"
                              variant={flipH ? "default" : "outline"}
                              className="h-9 font-medium"
                              onClick={() => setFlipH(prev => !prev)}
                            >
                              <FlipHorizontal2 className="w-4 h-4 mr-2" />
                              Horizontal
                            </Button>
                            <Button 
                              type="button"
                              variant={flipV ? "default" : "outline"}
                              className="h-9 font-medium"
                              onClick={() => setFlipV(prev => !prev)}
                            >
                              <FlipVertical2 className="w-4 h-4 mr-2" />
                              Vertical
                            </Button>
                          </div>
                        </div>

                        <div>
                          <Button variant="outline" size="sm" onClick={handleResetPosition} className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
                            <RotateCw className="w-3 h-3 mr-2" />
                            Reset Adjustments
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-6 lg:p-8 border-t border-border bg-background shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] sticky bottom-0 z-20">
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base font-semibold">Quantity</Label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Min 1</span>
                    <Input 
                      type="number" 
                      min={1} 
                      value={formData.quantity} 
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        if (val < 1) return;
                        setFormData({...formData, quantity: e.target.value});
                      }}
                      className="w-24 bg-background font-medium text-center"
                    />
                  </div>
                </div>
                
                <div className="mb-6 p-4 rounded-xl border border-primary/10 bg-primary/5 flex flex-col transition-all duration-300">
                  <div className="flex justify-between items-center mb-1">
                    <Label className="text-sm font-semibold">Printing Method</Label>
                    <span className="text-sm font-bold text-primary">{printingMethod}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    *Automatically selected for orders {printingMethod === "Laser Engraving" ? "of 1–10 units" : "above 10 units"}.
                  </p>
                </div>

                <Button 
                  className="w-full text-base h-14 font-semibold shadow-sm" 
                  size="lg"
                  onClick={() => setStep("quote")}
                >
                  Request a Quote
                </Button>
                
                <p className="text-[11px] text-center text-muted-foreground mt-4 leading-relaxed max-w-[300px] mx-auto">
                  Preview is for visualization purposes. Final branding placement may vary slightly depending on the product and production method.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === "quote" && (
          <div className="flex flex-col h-full bg-[#F9FAFB]">
            <DialogHeader className="px-6 py-5 md:px-10 md:py-8 border-b border-border bg-background pb-6 shrink-0 flex flex-row items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold tracking-tight">Request a Quote</DialogTitle>
                <DialogDescription className="mt-1.5">
                  Our team will review your requirements and contact you shortly.
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep("customize")} className="hidden sm:flex">
                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Customization
              </Button>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row h-full">
                <div className="flex-1 p-6 md:p-10 lg:pr-12">
                  <h3 className="font-semibold text-lg mb-6">Quote Details</h3>
                  
                  {errorMsg && (
                    <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex gap-3 text-sm">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p>{errorMsg}</p>
                    </div>
                  )}

                  <form id="quote-form" onSubmit={submitQuote} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2.5">
                        <Label htmlFor="fullName">Full Name *</Label>
                        <Input id="fullName" required value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="bg-background" />
                      </div>
                      <div className="space-y-2.5">
                        <Label htmlFor="company">Company Name *</Label>
                        <Input id="company" required value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="bg-background" />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2.5">
                        <Label htmlFor="email">Work Email *</Label>
                        <Input id="email" type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="bg-background" />
                      </div>
                      <div className="space-y-2.5">
                        <Label htmlFor="phone">Phone Number *</Label>
                        <Input id="phone" type="tel" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="bg-background" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2.5">
                        <Label htmlFor="date">Required Delivery Date</Label>
                        <Input id="date" type="date" value={formData.deliveryDate} onChange={e => setFormData({...formData, deliveryDate: e.target.value})} className="bg-background" />
                      </div>
                      <div className="space-y-2.5">
                        <Label htmlFor="location">Delivery Location (City/Pincode) *</Label>
                        <Input id="location" required value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="bg-background" />
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <Label htmlFor="req">Additional Requirements</Label>
                      <Textarea 
                        id="req" 
                        placeholder="Special packaging, color requests, multiple shipping addresses..." 
                        className="min-h-[100px] resize-none bg-background"
                        value={formData.requirements} 
                        onChange={e => setFormData({...formData, requirements: e.target.value})}
                      />
                    </div>
                  </form>
                </div>

                <div className="w-full lg:w-[420px] shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-background p-6 md:p-10 flex flex-col">
                  <div className="flex items-center justify-between mb-6 lg:mb-8">
                    <h3 className="font-semibold text-lg">Your Customization</h3>
                    <Button variant="ghost" size="sm" onClick={() => setStep("customize")} className="sm:hidden text-primary">
                      Edit
                    </Button>
                  </div>
                  
                  <div className="w-full aspect-[4/5] bg-[#F9FAFB] rounded-xl border border-border mb-8 flex items-center justify-center p-6 relative overflow-hidden shadow-inner">
                    <img 
                      src={product.images?.[0] || "https://placehold.co/800x1000/f8f9fa/a1a1aa?text=Product"} 
                      alt="Product" 
                      className="w-full h-full object-contain pointer-events-none drop-shadow-sm"
                    />
                    {logo && (
                      <div className="absolute inset-0 m-auto flex items-center justify-center">
                        <img src={currentDisplayLogo || ""} alt="Logo" className="object-contain" style={{ mixBlendMode: activeMixBlend as any, filter: printingMethod === "Laser Engraving" ? laserDropShadow : "drop-shadow(0 1px 2px rgb(0 0 0 / 0.1))",  
                            width: `${logoScale[0]}%`, 
                            rotate: `${logoRotation[0]}deg`,
                            transform: `translate(${logoPos.x * 0.3}px, ${logoPos.y * 0.3}px)`
                          }} 
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-5 text-sm flex-1">
                    <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                      <span className="text-muted-foreground">Product</span>
                      <span className="font-medium text-right text-foreground">{product.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                      <span className="text-muted-foreground">Quantity</span>
                      <span className="font-medium text-right text-foreground">{formData.quantity}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                      <span className="text-muted-foreground">Printing Method</span>
                      <span className="font-medium text-right text-foreground">{printingMethod}</span>
                    </div>
                    {logoFile ? (
                      <>
                        <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                          <span className="text-muted-foreground">Logo</span>
                          <span className="font-medium text-right text-foreground truncate" title={logoFile.name}>{logoFile.name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                          <span className="text-muted-foreground">Customization</span>
                          <span className="font-medium text-right text-foreground">Direct Placement</span>
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                        <span className="text-muted-foreground">Branding</span>
                        <span className="font-medium text-right text-foreground">Unbranded</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-6 mt-auto">
                    <Button 
                      type="submit" 
                      form="quote-form" 
                      className="w-full h-14 text-base font-semibold shadow-sm" 
                      size="lg"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        "Submit Quote Request"
                      )}
                    </Button>
                    <p className="text-[11px] text-center text-muted-foreground mt-4 leading-relaxed">
                      Final pricing depends on quantity, branding method, customization and delivery requirements.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-background">
            <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-8 shadow-sm">
              <Check className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-bold mb-2 tracking-tight">Quote Request Received</h2>
            <p className="font-mono text-sm bg-muted px-4 py-2 rounded-md border border-border mb-6">
              {refNumber}
            </p>
            <p className="text-lg text-muted-foreground max-w-[500px] mb-10 leading-relaxed">
              Your corporate gifting request has been successfully submitted. We've sent a confirmation to your email.
            </p>
            <Button size="lg" onClick={() => onOpenChange(false)} className="px-12 h-14 text-base font-medium shadow-sm">
              Close Window
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}



