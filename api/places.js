export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID || 'c1336038-2495-48aa-bb67-cd6a1ceb82e1';
  if (!token) return res.status(503).json({ error: 'Notion integration is not configured' });

  const text = (items) => (items || []).map(x => x.plain_text || x.text?.content || '').join('');
  const value = (p) => {
    if (!p) return '';
    if (p.type === 'title') return text(p.title);
    if (p.type === 'rich_text') return text(p.rich_text);
    if (p.type === 'select') return p.select?.name || '';
    if (p.type === 'url') return p.url || '';
    if (p.type === 'date') return p.date?.start || '';
    if (p.type === 'multi_select') return (p.multi_select || []).map(x => x.name);
    return '';
  };

  try {
    const places = [];
    let cursor;
    do {
      const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Notion API request failed' });
      for (const page of data.results || []) {
        const p = page.properties || {};
        const name = value(p['이름']);
        if (!name) continue;
        places.push({
          name,
          region: value(p['지역']),
          category: value(p['카테고리']),
          note: value(p['메모']),
          map: value(p['구글맵']),
          notion: page.url || '',
          photo: value(p['사진']),
          tags: value(p['태그']),
          saved: value(p['저장일'])
        });
      }
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);
    return res.status(200).json({ places, count: places.length, source: 'notion', updatedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load Notion places' });
  }
}
