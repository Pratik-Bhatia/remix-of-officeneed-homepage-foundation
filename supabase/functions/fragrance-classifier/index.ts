import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const API_SECRET = Deno.env.get("API_SECRET") || "test_secret_key"; // Require this header from Shopify Flow

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-api-key, content-type" } });
  }

  const authHeader = req.headers.get("x-api-key") || req.headers.get("authorization");
  if (!authHeader || (authHeader !== API_SECRET && authHeader !== `Bearer ${API_SECRET}`)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const payload = await req.json();
    const { id, title, description, productType, vendor, tags, metafields } = payload;

    if (!title) {
      return new Response(JSON.stringify({ error: "Missing required product title" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    if (!OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY environment variable");
    }

    const systemPrompt = `You are an expert fragrance classifier. Your job is to classify perfumes into strict categories based on their product details.
    
RULES:
1. Never invent a value outside the predefined lists.
2. Never invent fragrance notes.
3. Use the product title, description, vendor, tags, and existing Shopify information as evidence.
4. If information is insufficient, choose "Not Sure" where that value exists rather than guessing.
5. Return ONLY a valid JSON object matching the requested schema.`;

    const userPrompt = `Classify this fragrance:
Title: ${title}
Product Type: ${productType || "Unknown"}
Vendor: ${vendor || "Unknown"}
Tags: ${tags ? JSON.stringify(tags) : "None"}
Existing Metafields: ${metafields ? JSON.stringify(metafields) : "None"}
Description: ${description || "None"}
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fragrance_classification",
            strict: true,
            schema: {
              type: "object",
              properties: {
                notes: { type: "array", items: { type: "string", enum: ["Woody", "Floral", "Citrus", "Fresh", "Fruity", "Musky", "Spicy", "Sweet", "Aquatic", "Oud"] }, description: "Maximum 3" },
                occasion: { type: "array", items: { type: "string", enum: ["Everyday / Daily Wear", "Office / Professional", "Date / Romantic", "Party / Celebration", "Wedding / Special Occasion", "Birthday / Anniversary", "Festive / Gifting", "Travel / Vacation", "Corporate Gift", "Just Because"] }, description: "Maximum 4" },
                personality: { type: "array", items: { type: "string", enum: ["Elegant & Classy", "Confident & Bold", "Calm & Sophisticated", "Fresh & Energetic", "Romantic & Charming", "Adventurous & Free-spirited", "Fun & Playful", "Mysterious & Intense", "Minimal & Understated"] }, description: "Maximum 2" },
                intensity: { type: "string", enum: ["Subtle", "Balanced", "Bold"] },
                mood: { type: "array", items: { type: "string", enum: ["Fresh & Energising", "Sophisticated & Premium", "Romantic & Sensual", "Confident & Powerful", "Soft & Elegant", "Warm & Comforting", "Fun & Playful", "Mysterious & Alluring"] }, description: "Maximum 2" },
                age_group: { type: "array", items: { type: "string", enum: ["18–24", "25–34", "35–44", "45–54", "55+", "Not Sure"] }, description: "Maximum 2" },
                time_of_day: { type: "array", items: { type: "string", enum: ["Morning", "Daytime", "Evening", "Night", "All Day"] }, description: "Maximum 2" },
                weather: { type: "array", items: { type: "string", enum: ["Hot & Sunny", "Warm & Pleasant", "Cool & Mild", "Cold & Cozy", "All Weather", "Not Sure"] }, description: "Maximum 2" },
                recipient: { type: "array", items: { type: "string", enum: ["Men", "Women", "Unisex", "Not Sure"] }, description: "Maximum 3" },
                gift_suitable: { type: "boolean" },
                corporate_gift: { type: "boolean" },
                confidence: { type: "number", description: "0-100" },
                reasoning_summary: { type: "string", description: "Short reasoning for the classification." }
              },
              required: ["notes", "occasion", "personality", "intensity", "mood", "age_group", "time_of_day", "weather", "recipient", "gift_suitable", "corporate_gift", "confidence", "reasoning_summary"],
              additionalProperties: false
            }
          }
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI API Error:", errText);
      return new Response(JSON.stringify({ error: "Failed to classify fragrance via AI" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

    // Apply strict maximums if OpenAI exceeded them (fallback validation)
    if (result.notes.length > 3) result.notes = result.notes.slice(0, 3);
    if (result.occasion.length > 4) result.occasion = result.occasion.slice(0, 4);
    if (result.personality.length > 2) result.personality = result.personality.slice(0, 2);
    if (result.mood.length > 2) result.mood = result.mood.slice(0, 2);
    if (result.age_group.length > 2) result.age_group = result.age_group.slice(0, 2);
    if (result.time_of_day.length > 2) result.time_of_day = result.time_of_day.slice(0, 2);
    if (result.weather.length > 2) result.weather = result.weather.slice(0, 2);
    if (result.recipient.length > 3) result.recipient = result.recipient.slice(0, 3);

    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
