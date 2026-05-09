import { invoke } from '@tauri-apps/api/core';

export type StoreModel = { id:number; name:string; description:string; image_path:string; image_thumb_path:string; image_data_url?:string | null; image_thumb_data_url?:string | null; created_at:string; updated_at:string };
export type Category = { id:number; name:string; description:string; store_model_id:number; display_order:number; created_at:string; updated_at:string };
export type TagLite = { id:number; name:string };
export type Tag = TagLite & { description:string; carrier_count:number; photo_count:number };
export type CarrierModelLink = { store_model_id:number; store_model_name:string; category_id:number; category_name:string; display_order:number };
export type Carrier = { id:number; public_id:string; own_name:string; warehouse_name:string; description:string; width:number; height:number; depth:number; unit:string; store_model_id:number; category_id:number; store_model_name:string; category_name:string; model_links:CarrierModelLink[]; tags:TagLite[]; created_at:string; updated_at:string };
export type Photo = { id:number; file_name:string; file_path:string; thumb_path:string; description:string; tags:TagLite[]; created_at:string; data_url?:string | null; thumb_data_url?:string | null };
export type CarrierModelInput = { store_model_id:number; category_id:number };
export type CarrierInput = { own_name:string; warehouse_name:string; description:string; width:number; height:number; depth:number; unit:string; store_model_id:number; category_id:number; model_links:CarrierModelInput[]; tag_ids:number[] };

export const api = {
  models: () => invoke<StoreModel[]>('list_store_models'),
  saveModel: (id:number|null, name:string, description:string, imageSourcePath?:string|null) => invoke<number>('save_store_model', { id, name, description, imageSourcePath }),
  deleteModel: (id:number) => invoke<void>('delete_store_model', { id }),
  categories: (storeModelId?:number|null) => invoke<Category[]>('list_categories', { storeModelId }),
  saveCategory: (id:number|null, name:string, description:string, storeModelId:number, displayOrder:number) => invoke<number>('save_category', { id, name, description, storeModelId, displayOrder }),
  deleteCategory: (id:number) => invoke<void>('delete_category', { id }),
  tags: () => invoke<Tag[]>('list_tags'),
  saveTag: (id:number|null, name:string, description:string) => invoke<number>('save_tag', { id, name, description }),
  deleteTag: (id:number) => invoke<void>('delete_tag', { id }),
  carriers: (filters:{storeModelId?:number|null; categoryId?:number|null; search?:string; tagId?:number|null}) => invoke<Carrier[]>('list_carriers', filters),
  saveCarrier: (id:number|null, input:CarrierInput) => invoke<number>('save_carrier', { id, input }),
  deleteCarrier: (id:number) => invoke<void>('delete_carrier', { id }),
  photos: () => invoke<Photo[]>('list_photos'),
  addPhoto: (sourcePath:string, name:string, description:string, tagIds:number[]) => invoke<number>('add_photo', { sourcePath, name, description, tagIds }),
  updatePhoto: (id:number, name:string, description:string, tagIds:number[]) => invoke<void>('update_photo', { id, name, description, tagIds }),
  deletePhoto: (id:number) => invoke<void>('delete_photo', { id }),
  carrierPhotos: (carrierId:number) => invoke<Photo[]>('get_carrier_photos', { carrierId })
};
