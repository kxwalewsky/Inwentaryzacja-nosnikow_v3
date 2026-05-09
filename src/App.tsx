import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { api, Carrier, CarrierInput, Category, Photo, StoreModel, Tag } from './lib/api';
import { exportCarriersPdf } from './lib/pdf';

type Tab = 'carriers' | 'photos' | 'tags' | 'models';
type Notice = { kind:'ok'|'err'; text:string } | null;
type ExportDialogState = { fileName:string; mode:'all'|'model'; modelId:number|null } | null;

const emptyCarrier = (modelId = 0, categoryId = 0): CarrierInput => ({ own_name:'', warehouse_name:'', description:'', width:0, height:0, depth:0, unit:'cm', store_model_id:modelId, category_id:categoryId, model_links:modelId && categoryId ? [{store_model_id:modelId, category_id:categoryId}] : [], tag_ids:[] });

function tagList(tags: {name:string}[]) { return tags.map(t => t.name).join(', ') || 'bez tagów'; }
function fileNameFromPath(path:string) { return path.split(/[\\/]/).pop() || 'zdjecie'; }

export default function App() {
  const [tab, setTab] = useState<Tab>('carriers');
  const [models, setModels] = useState<StoreModel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCarrier, setSelectedCarrier] = useState<Carrier | null>(null);
  const [carrierPhotos, setCarrierPhotos] = useState<Photo[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [dark, setDark] = useState(false);
  const [tileView, setTileView] = useState(false);
  const [carrierForm, setCarrierForm] = useState<{id:number|null; data:CarrierInput} | null>(null);
  const [exportDialog, setExportDialog] = useState<ExportDialogState>(null);

  const visibleCategories = useMemo(() => selectedModelId ? categories.filter(c => c.store_model_id === selectedModelId) : categories, [categories, selectedModelId]);

  async function refreshBase() {
    const [m, c, t] = await Promise.all([api.models(), api.categories(null), api.tags()]);
    setModels(m); setCategories(c); setTags(t);
    if (!selectedModelId && m[0]) setSelectedModelId(m[0].id);
  }
  async function refreshCarriers() {
    const list = await api.carriers({ storeModelId:selectedModelId, categoryId:selectedCategoryId, search, tagId:selectedTagId });
    setCarriers(list);
    if (selectedCarrier) setSelectedCarrier(list.find(x => x.id === selectedCarrier.id) ?? list[0] ?? null);
    else setSelectedCarrier(list[0] ?? null);
  }
  async function refreshPhotos() { setPhotos(await api.photos()); }

  useEffect(() => { refreshBase().catch(showErr); refreshPhotos().catch(showErr); }, []);
  useEffect(() => { refreshCarriers().catch(showErr); }, [selectedModelId, selectedCategoryId, selectedTagId, search]);
  useEffect(() => { if (selectedCarrier) api.carrierPhotos(selectedCarrier.id).then(setCarrierPhotos).catch(showErr); else setCarrierPhotos([]); }, [selectedCarrier?.id]);
  useEffect(() => { document.body.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);

  function showOk(text:string) { setNotice({kind:'ok', text}); setTimeout(() => setNotice(null), 2600); }
  function showErr(e:unknown) { setNotice({kind:'err', text:String(e)}); }

  function beginAddCarrier() {
    const modelId = selectedModelId ?? models[0]?.id ?? 0;
    const catId = selectedCategoryId ?? categories.find(c => c.store_model_id === modelId)?.id ?? categories[0]?.id ?? 0;
    setCarrierForm({ id:null, data:emptyCarrier(modelId, catId) });
  }
  function beginEditCarrier(c:Carrier) {
    const links = c.model_links.length ? c.model_links.map(l => ({ store_model_id:l.store_model_id, category_id:l.category_id })) : [{ store_model_id:c.store_model_id, category_id:c.category_id }];
    setCarrierForm({ id:c.id, data:{ own_name:c.own_name, warehouse_name:c.warehouse_name, description:c.description, width:c.width, height:c.height, depth:c.depth, unit:c.unit, store_model_id:links[0]?.store_model_id ?? c.store_model_id, category_id:links[0]?.category_id ?? c.category_id, model_links:links, tag_ids:c.tags.map(t => t.id) } });
  }
  async function saveCarrierForm() {
    if (!carrierForm) return;
    if (!carrierForm.data.own_name.trim()) return showErr('Podaj nazwę własną nośnika.');
    if (carrierForm.data.model_links.length === 0) return showErr('Wybierz przynajmniej jeden model sklepu.');
    await api.saveCarrier(carrierForm.id, carrierForm.data);
    setCarrierForm(null); showOk('Nośnik zapisany.'); await refreshCarriers(); await refreshBase();
  }
  async function removeCarrier(c:Carrier) {
    if (!confirm(`Usunąć nośnik: ${c.own_name}?`)) return;
    await api.deleteCarrier(c.id); showOk('Nośnik usunięty.'); setSelectedCarrier(null); await refreshCarriers(); await refreshBase();
  }
  async function addPhotos() {
    const picked = await open({ multiple:true, directory:false, filters:[{ name:'Zdjęcia', extensions:['png','jpg','jpeg','webp'] }] });
    const files = Array.isArray(picked) ? picked : picked ? [picked] : [];
    for (const file of files) await api.addPhoto(String(file), fileNameFromPath(String(file)), '', selectedTagId ? [selectedTagId] : []);
    showOk(`Dodano zdjęcia: ${files.length}.`); await refreshPhotos();
  }
  async function openExportDialog(mode:'all'|'model' = 'all') {
    setExportDialog({ fileName:`inwentaryzacja-nosnikow-${new Date().toISOString().slice(0,10)}`, mode, modelId:selectedModelId ?? models[0]?.id ?? null });
  }
  async function runExport() {
    if (!exportDialog) return;
    const model = exportDialog.mode === 'model' ? models.find(m => m.id === exportDialog.modelId) ?? null : null;
    const targets = await api.carriers({ storeModelId: exportDialog.mode === 'model' ? exportDialog.modelId : null, categoryId:null, search:'', tagId:null });
    const pairs = await Promise.all(targets.map(async c => [c.id, await api.carrierPhotos(c.id)] as const));
    exportCarriersPdf(targets, Object.fromEntries(pairs), { fileName:exportDialog.fileName, mode:exportDialog.mode, model });
    setExportDialog(null);
    alert('Eksport PDF zakończony pomyślnie.');
    showOk('Eksport PDF zakończony pomyślnie.');
  }

  return <div className="app">
    <header className="topbar">
      <div><b>Repetytorium POS</b><span>Lokalna aplikacja do wyposażenia sklepów</span></div>
      <nav>
        {(['carriers','photos','tags','models'] as Tab[]).map(t => <button className={tab===t?'active':''} onClick={() => setTab(t)} key={t}>{label(t)}</button>)}
      </nav>
      <button onClick={() => setDark(!dark)}>{dark ? 'Tryb jasny' : 'Tryb ciemny'}</button>
    </header>
    {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}

    <main className="workspace">
      <aside className="sidebar">
        <h3>Modele sklepów</h3>
        {models.map(m => <button key={m.id} onClick={() => { setSelectedModelId(m.id); setSelectedCategoryId(null); }} className={selectedModelId===m.id?'selected rowbtn':'rowbtn'}>{m.name}</button>)}
        <h3>Kategorie</h3>
        <button onClick={() => setSelectedCategoryId(null)} className={!selectedCategoryId?'selected rowbtn':'rowbtn'}>Wszystkie</button>
        {visibleCategories.map(c => <button key={c.id} onClick={() => setSelectedCategoryId(c.id)} className={selectedCategoryId===c.id?'selected rowbtn':'rowbtn'}>{c.name}</button>)}
      </aside>

      <section className="content">
        {tab === 'carriers' && <>
          <div className="toolbar"><input placeholder="Szukaj po nazwie, ID lub nazwie magazynowej" value={search} onChange={e => setSearch(e.target.value)} /><select value={selectedTagId ?? ''} onChange={e => setSelectedTagId(e.target.value ? Number(e.target.value) : null)}><option value="">Wszystkie tagi</option>{tags.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select><button onClick={() => setTileView(!tileView)}>{tileView?'Tabela':'Kafelki'}</button><button className="primary" onClick={beginAddCarrier}>Dodaj nośnik</button><button className="success" onClick={()=>openExportDialog('all')}>Eksport PDF</button></div>
          <div className="split">
            <div className={tileView ? 'cards' : 'tablewrap'}>{tileView ? carriers.map(c => <article key={c.id} onClick={() => setSelectedCarrier(c)} className={selectedCarrier?.id===c.id?'card selected':'card'}><b>{c.own_name}</b><small>{c.public_id}</small><p>{c.model_links.map(l=>`${l.store_model_name} / ${l.category_name}`).join(', ') || c.category_name}</p><span>{tagList(c.tags)}</span></article>) : <table><thead><tr><th>Nazwa</th><th>ID</th><th>Magazyn</th><th>Kategoria</th><th>Tagi</th></tr></thead><tbody>{carriers.map(c => <tr key={c.id} onClick={() => setSelectedCarrier(c)} className={selectedCarrier?.id===c.id?'selected':''}><td>{c.own_name}</td><td>{c.public_id}</td><td>{c.warehouse_name}</td><td>{c.model_links.map(l=>l.category_name).join(', ') || c.category_name}</td><td>{tagList(c.tags)}</td></tr>)}</tbody></table>}</div>
            <CarrierDetails carrier={selectedCarrier} photos={carrierPhotos} onEdit={beginEditCarrier} onDelete={removeCarrier} onPdf={()=>openExportDialog(selectedModelId ? 'model' : 'all')} />
          </div>
        </>}
        {tab === 'photos' && <PhotoLibrary photos={photos} tags={tags} onAdd={addPhotos} onRefresh={async()=>{ await refreshPhotos(); await refreshCarriers(); }} showErr={showErr} showOk={showOk} />}
        {tab === 'tags' && <TagsView tags={tags} onRefresh={refreshBase} showErr={showErr} showOk={showOk} />}
        {tab === 'models' && <ModelsView models={models} categories={categories} onRefresh={refreshBase} showErr={showErr} showOk={showOk} />}
      </section>
    </main>

    {carrierForm && <div className="modal"><div className="dialog wide"><h2>{carrierForm.id ? 'Edytuj nośnik' : 'Dodaj nośnik'}</h2><CarrierForm data={carrierForm.data} tags={tags} models={models} categories={categories} onChange={data => setCarrierForm({...carrierForm, data})} /><footer><button onClick={() => setCarrierForm(null)}>Anuluj</button><button className="primary" onClick={saveCarrierForm}>Zapisz</button></footer></div></div>}
    {exportDialog && <div className="modal"><div className="dialog"><h2>Eksport PDF</h2><div className="formgrid"><label className="full">Nazwa pliku PDF<input value={exportDialog.fileName} onChange={e=>setExportDialog({...exportDialog, fileName:e.target.value})} /></label><label className="full">Zakres eksportu<select value={exportDialog.mode} onChange={e=>setExportDialog({...exportDialog, mode:e.target.value as 'all'|'model'})}><option value="all">Wszystkie nośniki</option><option value="model">Nośniki przypisane do danego modelu sklepu</option></select></label>{exportDialog.mode === 'model' && <label className="full">Model sklepu<select value={exportDialog.modelId ?? ''} onChange={e=>setExportDialog({...exportDialog, modelId:Number(e.target.value)})}>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}</div><footer><button onClick={()=>setExportDialog(null)}>Anuluj</button><button className="success" onClick={runExport}>Eksportuj</button></footer></div></div>}
  </div>;
}

function label(t:Tab) { return {carriers:'Nośniki', photos:'Biblioteka zdjęć', tags:'Tagi', models:'Modele i kategorie'}[t]; }

function CarrierDetails({ carrier, photos, onEdit, onDelete, onPdf }:{carrier:Carrier|null; photos:Photo[]; onEdit:(c:Carrier)=>void; onDelete:(c:Carrier)=>void; onPdf:()=>void}) {
  if (!carrier) return <aside className="details empty">Wybierz nośnik z listy.</aside>;
  return <aside className="details"><h2>{carrier.own_name}</h2><p className="muted">{carrier.public_id}</p><dl><dt>Nazwa magazynowa</dt><dd>{carrier.warehouse_name || '-'}</dd><dt>Modele</dt><dd>{carrier.model_links.map(l=>l.store_model_name).join(', ') || carrier.store_model_name}</dd><dt>Kategorie</dt><dd>{carrier.model_links.map(l=>l.category_name).join(', ') || carrier.category_name}</dd><dt>Wymiary</dt><dd>{carrier.width} × {carrier.height} × {carrier.depth} {carrier.unit}</dd><dt>Tagi</dt><dd>{tagList(carrier.tags)}</dd><dt>Opis</dt><dd>{carrier.description || '-'}</dd></dl><h3>Galeria po tagach</h3><div className="gallery">{photos.map(p => <figure key={p.id}>{p.thumb_data_url && <img src={p.thumb_data_url} /> }<figcaption>{p.description || p.file_name}</figcaption></figure>)}{photos.length===0 && <p className="muted">Brak zdjęć z pasującymi tagami.</p>}</div><div className="actions"><button onClick={() => onEdit(carrier)}>Edytuj</button><button className="success" onClick={onPdf}>Eksportuj do PDF</button><button className="danger" onClick={() => onDelete(carrier)}>Usuń</button></div></aside>;
}

function MultiTagSelect({ tags, selectedIds, onChange }:{tags:Tag[]; selectedIds:number[]; onChange:(ids:number[])=>void}) {
  const [query, setQuery] = useState('');
  const selected = tags.filter(t => selectedIds.includes(t.id));
  const filtered = tags.filter(t => t.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="multiselect"><div className="selectedTags">{selected.length ? selected.map(t => <span key={t.id}>{t.name}</span>) : <span className="muted">Brak wybranych tagów</span>}</div><details><summary>Wybierz tagi</summary><input placeholder="Szukaj tagu" value={query} onChange={e=>setQuery(e.target.value)} /><div className="multiOptions">{filtered.map(t => <label key={t.id}><input type="checkbox" checked={selectedIds.includes(t.id)} onChange={e=>onChange(e.target.checked ? [...selectedIds, t.id] : selectedIds.filter(id => id !== t.id))}/>{t.name}</label>)}</div></details></div>;
}

function CarrierForm({ data, onChange, models, categories, tags }:{data:CarrierInput; onChange:(d:CarrierInput)=>void; models:StoreModel[]; categories:Category[]; tags:Tag[]}) {
  const set = (patch:Partial<CarrierInput>) => onChange({...data, ...patch});
  function toggleModel(modelId:number, checked:boolean) {
    if (!checked) return set({ model_links:data.model_links.filter(l => l.store_model_id !== modelId) });
    const firstCategory = categories.find(c => c.store_model_id === modelId);
    if (!firstCategory) return;
    const links = [...data.model_links, { store_model_id:modelId, category_id:firstCategory.id }];
    set({ model_links:links, store_model_id:links[0].store_model_id, category_id:links[0].category_id });
  }
  function setCategoryForModel(modelId:number, categoryId:number) {
    const links = data.model_links.map(l => l.store_model_id === modelId ? {...l, category_id:categoryId} : l);
    set({ model_links:links, store_model_id:links[0]?.store_model_id ?? 0, category_id:links[0]?.category_id ?? 0 });
  }
  return <div className="formgrid"><label>Nazwa własna<input value={data.own_name} onChange={e=>set({own_name:e.target.value})} /></label><label>Nazwa magazynowa<input value={data.warehouse_name} onChange={e=>set({warehouse_name:e.target.value})} /></label><div className="full modelPicker"><b>Modele sklepów i kategorie</b>{models.map(m => { const link = data.model_links.find(l => l.store_model_id === m.id); const modelCategories = categories.filter(c => c.store_model_id === m.id); return <div className="modelPickRow" key={m.id}><label><input type="checkbox" checked={!!link} onChange={e=>toggleModel(m.id, e.target.checked)} />{m.name}</label>{link && <select value={link.category_id} onChange={e=>setCategoryForModel(m.id, Number(e.target.value))}>{modelCategories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select>}</div>; })}</div><label>Szerokość<input type="number" value={data.width} onChange={e=>set({width:Number(e.target.value)})} /></label><label>Wysokość<input type="number" value={data.height} onChange={e=>set({height:Number(e.target.value)})} /></label><label>Głębokość<input type="number" value={data.depth} onChange={e=>set({depth:Number(e.target.value)})} /></label><label>Jednostka<select value={data.unit} onChange={e=>set({unit:e.target.value})}><option>mm</option><option>cm</option><option>m</option></select></label><label className="full">Opis<textarea value={data.description} onChange={e=>set({description:e.target.value})} /></label><div className="full"><label>Tagi</label><MultiTagSelect tags={tags} selectedIds={data.tag_ids} onChange={ids=>set({tag_ids:ids})} /></div></div>;
}

function PhotoLibrary({ photos, tags, onAdd, onRefresh, showOk, showErr }:{photos:Photo[]; tags:Tag[]; onAdd:()=>void; onRefresh:()=>Promise<void>; showOk:(s:string)=>void; showErr:(e:unknown)=>void}) {
  const [view, setView] = useState<'tiles'|'list'>('tiles');
  const [editing, setEditing] = useState<Photo|null>(null);
  return <><div className="toolbar"><button className="primary" onClick={onAdd}>Dodaj zdjęcia z dysku</button><button onClick={()=>setView(view === 'tiles' ? 'list' : 'tiles')}>{view === 'tiles' ? 'Widok: kafelkowy' : 'Widok: lista'}</button><span className="muted">Zdjęcie pojawia się przy nośniku, gdy mają wspólny tag.</span></div>{view === 'tiles' ? <div className="photoGrid">{photos.map(p => <PhotoCard key={p.id} photo={p} onEdit={setEditing} onRefresh={onRefresh} showOk={showOk} showErr={showErr} />)}</div> : <table><thead><tr><th>Nazwa zdjęcia</th><th>Tagi</th><th>Opis</th><th></th></tr></thead><tbody>{photos.map(p => <tr key={p.id}><td>{p.file_name}</td><td>{tagList(p.tags)}</td><td>{p.description || '-'}</td><td><button onClick={()=>setEditing(p)}>Edytuj</button></td></tr>)}</tbody></table>}{editing && <PhotoEditDialog photo={editing} tags={tags} onClose={()=>setEditing(null)} onSaved={async()=>{ setEditing(null); showOk('Zdjęcie zapisane.'); await onRefresh(); }} showErr={showErr} />}</>;
}

function PhotoCard({ photo, onEdit, onRefresh, showOk, showErr }:{photo:Photo; onEdit:(p:Photo)=>void; onRefresh:()=>Promise<void>; showOk:(s:string)=>void; showErr:(e:unknown)=>void}) {
  async function remove() { if (!confirm(`Usunąć zdjęcie ${photo.file_name}?`)) return; try { await api.deletePhoto(photo.id); showOk('Zdjęcie usunięte.'); await onRefresh(); } catch(e) { showErr(e); } }
  return <article className="photo">{photo.thumb_data_url && <img src={photo.thumb_data_url} />}<b>{photo.file_name}</b><p>{photo.description || 'bez opisu'}</p><span>{tagList(photo.tags)}</span><footer><button onClick={()=>onEdit(photo)}>Edytuj</button><button className="danger" onClick={remove}>Usuń</button></footer></article>;
}

function PhotoEditDialog({ photo, tags, onClose, onSaved, showErr }:{photo:Photo; tags:Tag[]; onClose:()=>void; onSaved:()=>Promise<void>; showErr:(e:unknown)=>void}) {
  const [name, setName] = useState(photo.file_name);
  const [description, setDescription] = useState(photo.description);
  const [tagIds, setTagIds] = useState(photo.tags.map(t=>t.id));
  async function save() { try { await api.updatePhoto(photo.id, name, description, tagIds); await onSaved(); } catch(e) { showErr(e); } }
  return <div className="modal"><div className="dialog"><h2>Edytuj zdjęcie</h2><div className="formgrid"><label className="full">Nazwa zdjęcia<input value={name} onChange={e=>setName(e.target.value)} /></label><label className="full">Opis<textarea value={description} onChange={e=>setDescription(e.target.value)} /></label><div className="full"><label>Tagi</label><MultiTagSelect tags={tags} selectedIds={tagIds} onChange={setTagIds} /></div></div><footer><button onClick={onClose}>Anuluj</button><button className="primary" onClick={save}>Zapisz</button></footer></div></div>;
}

function TagsView({ tags, onRefresh, showOk, showErr }:{tags:Tag[]; onRefresh:()=>Promise<void>; showOk:(s:string)=>void; showErr:(e:unknown)=>void}) {
  async function save(tag?:Tag) { const name = prompt('Nazwa tagu', tag?.name ?? ''); if (!name) return; const desc = prompt('Opis tagu', tag?.description ?? '') ?? ''; try { await api.saveTag(tag?.id ?? null, name.trim(), desc); showOk('Tag zapisany.'); await onRefresh(); } catch(e) { showErr(e); } }
  async function remove(t:Tag) { if (!confirm(`Usunąć tag ${t.name}?`)) return; try { await api.deleteTag(t.id); showOk('Tag usunięty.'); await onRefresh(); } catch(e) { showErr(e); } }
  return <><div className="toolbar"><button className="primary" onClick={()=>save()}>Dodaj tag</button></div><table><thead><tr><th>Tag</th><th>Opis</th><th>Nośniki</th><th>Zdjęcia</th><th></th></tr></thead><tbody>{tags.map(t => <tr key={t.id}><td>{t.name}</td><td>{t.description}</td><td>{t.carrier_count}</td><td>{t.photo_count}</td><td><button onClick={()=>save(t)}>Edytuj</button><button className="danger" onClick={()=>remove(t)}>Usuń</button></td></tr>)}</tbody></table></>;
}

function ModelsView({ models, categories, onRefresh, showOk, showErr }:{models:StoreModel[]; categories:Category[]; onRefresh:()=>Promise<void>; showOk:(s:string)=>void; showErr:(e:unknown)=>void}) {
  async function saveModel(model?:StoreModel) {
    const name = prompt('Nazwa modelu sklepu', model?.name ?? ''); if (!name) return;
    const desc = prompt('Opis modelu', model?.description ?? '') ?? '';
    let imageSourcePath:string|null = null;
    if (confirm('Czy dodać lub zmienić zdjęcie modelu sklepu?')) {
      const picked = await open({ multiple:false, directory:false, filters:[{ name:'Zdjęcia', extensions:['png','jpg','jpeg','webp'] }] });
      imageSourcePath = picked ? String(picked) : null;
    }
    try { await api.saveModel(model?.id ?? null, name, desc, imageSourcePath); showOk('Model zapisany.'); await onRefresh(); } catch(e) { showErr(e); }
  }
  async function saveCat(modelId:number, cat?:Category) { const name = prompt('Nazwa kategorii', cat?.name ?? ''); if (!name) return; const desc = prompt('Opis kategorii', cat?.description ?? '') ?? ''; const order = Number(prompt('Kolejność wyświetlania', String(cat?.display_order ?? 0)) ?? 0); try { await api.saveCategory(cat?.id ?? null, name, desc, modelId, order); showOk('Kategoria zapisana.'); await onRefresh(); } catch(e) { showErr(e); } }
  async function delModel(m:StoreModel) { if (!confirm(`Usunąć model ${m.name} wraz z kategoriami?`)) return; try { await api.deleteModel(m.id); showOk('Model usunięty.'); await onRefresh(); } catch(e) { showErr(e); } }
  async function delCat(c:Category) { if (!confirm(`Usunąć kategorię ${c.name}?`)) return; try { await api.deleteCategory(c.id); showOk('Kategoria usunięta.'); await onRefresh(); } catch(e) { showErr(e); } }
  return <><div className="toolbar"><button className="primary" onClick={()=>saveModel()}>Dodaj model sklepu</button></div><div className="modelList">{models.map(m => <article className="model" key={m.id}><header><div className="modelHeaderInfo">{m.image_thumb_data_url && <img className="modelThumb" src={m.image_thumb_data_url} />}<div><h3>{m.name}</h3><p>{m.description}</p></div></div><div><button onClick={()=>saveModel(m)}>Edytuj</button><button onClick={()=>saveCat(m.id)}>Dodaj kategorię</button><button className="danger" onClick={()=>delModel(m)}>Usuń</button></div></header><table><tbody>{categories.filter(c=>c.store_model_id===m.id).map(c => <tr key={c.id}><td>{c.display_order}</td><td>{c.name}</td><td>{c.description}</td><td><button onClick={()=>saveCat(m.id,c)}>Edytuj</button><button className="danger" onClick={()=>delCat(c)}>Usuń</button></td></tr>)}</tbody></table></article>)}</div></>;
}
