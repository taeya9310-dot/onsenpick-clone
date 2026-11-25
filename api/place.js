export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.NOTION_API_KEY;
  const pageId = String(req.query.id || '').replace(/-/g, '');
  if (!token) return res.status(503).json({ error: 'Notion integration is not configured' });
  if (!/^[a-f0-9]{32}$/i.test(pageId)) return res.status(400).json({ error: 'Invalid page id' });
  const headers = { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' };
  const rich = a => (a || []).map(x => x.plain_text || x.text?.content || '').join('');
  async function children(id, depth=0) {
    if (depth > 3) return [];
    let out=[], cursor;
    do {
      const u = new URL(`https://api.notion.com/v1/blocks/${id}/children`);
      u.searchParams.set('page_size','100');
      if (cursor) u.searchParams.set('start_cursor',cursor);
      const r = await fetch(u, {headers});
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Notion block request failed');
      for (const b of d.results || []) {
        const v=b[b.type] || {};
        let text='';
        if (v.rich_text) text=rich(v.rich_text);
        else if (v.title) text=rich(v.title);
        else if (v.caption) text=rich(v.caption);
        else if (b.type==='child_page') text=v.title || '';
        else if (b.type==='bookmark' || b.type==='embed' || b.type==='link_preview') text=v.url || '';
        const item={type:b.type,text,has_children:b.has_children};
        if (b.type==='table_row') item.cells=(v.cells||[]).map(rich);
        if (b.type==='image' || b.type==='file' || b.type==='pdf') item.url=v.external?.url || v.file?.url || '';
        if (b.has_children) item.children=await children(b.id,depth+1);
        out.push(item);
      }
      cursor=d.has_more?d.next_cursor:null;
    } while(cursor);
    return out;
  }
  try {
    const r=await fetch(`https://api.notion.com/v1/pages/${pageId}`,{headers});
    const p=await r.json();
    if(!r.ok) return res.status(r.status).json({error:p.message||'Notion page request failed'});
    const blocks=await children(pageId);
    return res.status(200).json({id:pageId,title:rich(p.properties?.이름?.title)||rich(p.properties?.Name?.title)||'숙소 상세',url:p.url,blocks});
  } catch(e) { return res.status(500).json({error:e.message||'Unable to load lodging detail'}); }
}
