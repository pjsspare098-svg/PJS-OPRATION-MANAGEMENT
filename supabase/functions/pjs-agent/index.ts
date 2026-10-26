// PJS OMS manual-only baseline. Old AI agent API retained at its URL but disabled.
// Previously stored agent messages/tasks stay untouched in Supabase.
// Re-enable only after the user specifies and approves a new agent design.
Deno.serve((req: Request) => {
  const origin=req.headers.get('origin')||'';
  const allowed=[
    'https://pjs-oms-independent-pjsspare098-2655.vercel.app',
    'https://pjs-oms-independent.vercel.app',
    'http://localhost:3000','http://localhost:5173'
  ];
  const headers:Record<string,string>={
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':allowed.includes(origin)?origin:allowed[0],
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Vary':'Origin'
  };
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  return new Response(JSON.stringify({
    error:'PJS OMS AI agents are disabled while the manual-only base is redesigned.',
    enabled:false
  }),{status:410,headers});
});
