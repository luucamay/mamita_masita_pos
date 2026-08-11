export type QueueType = "kitchen" | "cafe";

export type Category = {
  id: string;
  name: string;
  slug: string;
  queue_type: QueueType;
  sort_order: number;
  active: boolean;
};

export type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  active: boolean;
  sort_order: number;
  categories?: Pick<Category, "id" | "name" | "slug" | "queue_type"> | null;
};

export type DraftOrderLine = {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  categoryName: string;
  queueType: QueueType;
};
