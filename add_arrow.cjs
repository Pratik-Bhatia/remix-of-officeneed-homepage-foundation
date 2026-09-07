const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  'import { MessageCircle, X, ChevronRight, Check, Send, Upload, Trash2, ArrowLeft, Gift, Droplets, Paperclip, Laptop, Briefcase, Sparkles, AlertCircle } from "lucide-react";',
  'import { MessageCircle, X, ChevronRight, Check, Send, Upload, Trash2, ArrowLeft, Gift, Droplets, Paperclip, Laptop, Briefcase, Sparkles, AlertCircle, ArrowRight } from "lucide-react";'
);

fs.writeFileSync(path, text);
console.log("Added ArrowRight import");
