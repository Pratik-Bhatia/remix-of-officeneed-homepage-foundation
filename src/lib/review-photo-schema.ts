import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Pending migration contract; does not imply the table exists at runtime. */
type ReviewImageRow = {
  id: string;
  review_id: string;
  product_handle: string;
  position: number;
  full_path: string;
  thumb_path: string;
  width: number | null;
  height: number | null;
  created_at: string;
};

type ReviewPhotoDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      product_review_images: {
        Row: ReviewImageRow;
        Insert: Omit<ReviewImageRow, "id" | "created_at" | "width" | "height"> &
          Partial<Pick<ReviewImageRow, "id" | "created_at" | "width" | "height">>;
        Update: Partial<ReviewImageRow>;
        Relationships: [{
          foreignKeyName: "product_review_images_review_id_fkey";
          columns: ["review_id"];
          isOneToOne: false;
          referencedRelation: "product_reviews";
          referencedColumns: ["id"];
        }];
      };
    };
  };
};

export type ReviewPhotoClient = SupabaseClient<ReviewPhotoDatabase>;