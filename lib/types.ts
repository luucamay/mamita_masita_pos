export type QueueType = "kitchen" | "cafe";
export type OrderStatus =
  | "pendiente"
  | "confirmado"
  | "entregado"
  | "pagado"
  | "archivado";

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

export type OpenOrder = {
  id: string;
  order_number: string;
  table_number: string;
  customer_name: string | null;
  status: OrderStatus;
  created_at: string;
  item_count: number;
  total: number | string;
};
