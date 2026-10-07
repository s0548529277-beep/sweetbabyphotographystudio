import sys,re,json,html,os
t=open(sys.argv[1],encoding='utf8').read()
out=sys.argv[2]; os.makedirs(out,exist_ok=True)
def g(p,s,d=''):
    m=re.search(p,s,re.S); return m.group(1) if m else d
def texts(o,acc):
    if isinstance(o,dict):
        for k,v in o.items():
            if k in('title','editor','text','description','content','heading','sub_title','title_text','description_text','testimonial_content','caption','alert_title','tab_title','tab_content','item_title','item_description') and isinstance(v,str) and v.strip(): acc.append(v)
            else: texts(v,acc)
    elif isinstance(o,list):
        for v in o: texts(v,acc)
def clean(s):
    s=re.sub(r'<(br|/p|/h\d|/li|/div)[^>]*>','\n',s); s=re.sub(r'<[^>]+>','',s)
    s=re.sub(r'<!--.*?-->','',s,flags=re.S); return re.sub(r'\n\s*\n+','\n\n',html.unescape(s)).strip()
n=0
for it in re.findall(r'<item>(.*?)</item>',t,re.S):
    ty=g(r'<wp:post_type><!\[CDATA\[(.*?)\]',it)
    if ty not in('page','post','blog'): continue
    title=re.sub(r'<!\[CDATA\[|\]\]>','',html.unescape(g(r'<title>(.*?)</title>',it))); slug=g(r'<wp:post_name><!\[CDATA\[(.*?)\]',it) or str(n)
    st=g(r'<wp:status><!\[CDATA\[(.*?)\]',it); link=g(r'<link>(.*?)</link>',it)
    body=clean(g(r'<content:encoded><!\[CDATA\[(.*?)\]\]>',it)); src='content'
    ed=re.search(r'<wp:meta_key><!\[CDATA\[_elementor_data\]\]></wp:meta_key>\s*<wp:meta_value><!\[CDATA\[(.*?)\]\]>',it,re.S)
    if ed:
        try:
            acc=[];texts(json.loads(ed.group(1)),acc); body='\n\n'.join(clean(a) for a in acc); src='elementor'
        except Exception as e: pass
    n+=1
    open(f'{out}/{ty}-{slug}.md','w',encoding='utf8').write(f'---\ntype: {ty}\nstatus: {st}\ntitle: {title}\nslug: {slug}\nurl: {link}\nsource: {src}\n---\n\n# {title}\n\n{body}\n')
    print(ty,st,src,len(body),slug,title[:30])
