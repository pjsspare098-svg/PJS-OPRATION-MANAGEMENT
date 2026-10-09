import { useEffect, useState } from 'react';
import { auth, cloudConfigured, supabase } from './independentClient';
import { cloud } from './cloud';
import PJSOriginalPages from './PJSOriginalPages';
import ProcessEditor from './ProcessEditor';
import ExcelLRWorkspace from './ExcelLRWorkspace';
import PendingChecks from './PendingChecks';
import LoginScreen from './LoginScreen';
import OverviewProcessSearch from './OverviewProcessSearch';
import './overview-search.css';
import './login.css';
import './excel-lr.css';
import './process-editor.css';
import './pjs-original.css';
import './legacy.css';
import {
  LayoutDashboard,
  Database,
  Mail,
  Truck,
  Send,
  ListChecks,
  FileSpreadsheet,
  Bot,
  Search,
  Bell,
  Plus,
  Upload,
  ArrowRight,
  X,
  Menu,
  FileText,
  CheckCircle2,
  Clock3,
  AlertCircle,
  ChevronDown,
  RefreshCw,
  LogOut,
} from 'lucide-react';
const menu = [
  ['Data Store', Database],
  ['Email Process', Mail],
  ['Tracking Delivery', Truck],
  ['Submit All Process', Send],
  ['Check List', ListChecks],
  ['Excel Bill & LR Finding', FileSpreadsheet],
  ['Pending Task AI Agent', Bot],
];
const initial = [
  {
    id: 'OMS-001',
    process: 'PJS-24081',
    party: 'Shree Industrial Supplies',
    invoice: 'INV-2026-041',
    docs: 4,
    status: 'Ready',
    email: false,
    tracking: false,
    bill: false,
  },
  {
    id: 'OMS-002',
    process: 'PJS-24082',
    party: 'Metro Engineering Works',
    invoice: 'INV-2026-042',
    docs: 2,
    status: 'Review',
    email: false,
    tracking: true,
    bill: false,
  },
  {
    id: 'OMS-003',
    process: 'PJS-24083',
    party: 'Apex Machinery Co.',
    invoice: 'INV-2026-043',
    docs: 5,
    status: 'Ready',
    email: true,
    tracking: true,
    bill: true,
  },
];
function App() {
  const [previewUser,setPreviewUser]=useState('');
  const [page, setPage] = useState('Overview');
  const [records, setRecords] = useState<any[]>([]);
  async function refreshRecords(){try{setRecords(await cloud.list())}catch{setNotice('Cloud data could not load. Retry refresh.')}}
  useEffect(()=>{auth.getUser().then(u=>{if(u)setPreviewUser(u.name||u.email||'OMS User')}).catch(()=>{})},[]);
  useEffect(()=>{if(previewUser)refreshRecords()},[previewUser]);
  useEffect(()=>{if(!supabase)return;const {data}=supabase.auth.onAuthStateChange((_event,session)=>{setPreviewUser(session?.user?.email||'')});return()=>data.subscription.unsubscribe()},[]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [modal, setModal] = useState('');
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  const [draft, setDraft] = useState({ process: '', party: '', so: '' });
  const [pickFile,setPickFile]=useState<File|null>(null);
  const [dest, setDest] = useState({
    email: false,
    tracking: false,
    bill: false,
  });
  const filtered = records.filter(r =>
    [r.process, r.party, r.so, r.invoice]
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  async function save() {
    if (!draft.process.trim()) {
      setNotice(
        'Process number is required. Extract it from the Pick Slip or enter it after verification.'
      );
      return;
    }
    if (
      records.some(r => r.process === draft.process && r.id !== selected?.id)
    ) {
      setNotice('A record with this process number already exists.');
      return;
    }
    try{const saved=await cloud.save({...draft,id:selected?.id});if(pickFile&&cloudConfigured)await cloud.upload(saved.id,'pickDoc',pickFile);setPickFile(null);await refreshRecords();setModal('');setNotice(cloudConfigured?'Process and Pick Slip saved to private cloud storage.':'Process saved in this browser only. Original PDF NOT stored; connect Supabase before operational use.')}catch(e:any){setNotice('Save failed: '+(e?.message||'Check your connection and retry.'))}
  }
  function openPage(p) {
    setPage(p);
    setMobile(false);
    setQuery('');
  }
  const title = page === 'Overview' ? 'Operations overview' : page;
  if(!previewUser)return <LoginScreen onLogin={setPreviewUser}/>;
  return (
    <div className="shell">
      <aside className={'sidebar ' + (mobile ? 'show' : '')}>
        <div className="brand">
          <div className="brandmark">O</div>
          <div>
            <strong>
              OMS<span className="dot">.</span>
            </strong>
            <small>OPERATION MANAGEMENT</small>
          </div>
        </div>
        <div className="navlabel">WORKSPACE</div>
        <button
          className={'nav ' + (page === 'Overview' ? 'active' : '')}
          onClick={() => openPage('Overview')}
        >
          <LayoutDashboard size={18} /> Overview
        </button>
        <div className="navlabel second">OPERATIONS</div>
        {menu.map(([name, Icon]) => (
          <button
            key={name}
            className={'nav ' + (page === name ? 'active' : '')}
            onClick={() => openPage(name)}
          >
            <Icon size={18} />
            <span>{name}</span>
            {false && name === 'Check List' && <em>3</em>}
          </button>
        ))}
        <div className="sidebarbottom">
          <span className="worker">
            <i /> Automation worker offline
          </span>
          <small>{cloudConfigured?'OMS Independent · Cloud':'OMS Independent · Local Preview'}</small>
          <button className="oms-logout" onClick={async()=>{await auth.signOut();setPreviewUser('');setRecords([]);setPage('Overview');setModal('')}}><LogOut size={16}/> Sign out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMobile(!mobile)}>
            <Menu size={22} />
          </button>
          <div className="crumb">
            Workspace <span>/</span> <b>{page}</b>
          </div>
          <div className="topright">
            <button className="oms-refresh" title={'Refresh '+page} onClick={()=>{setRefreshKey(k=>k+1);refreshRecords()}}><RefreshCw size={16}/><span>Refresh</span></button>
            <span className="preview">{cloudConfigured?'INDEPENDENT CLOUD':'LOCAL PREVIEW'}</span>
            <button
              className="iconbutton"
              onClick={() =>
                setNotice('Notifications will be connected in a later phase.')
              }
            >
              <Bell size={19} />
            </button>
            <div className="avatar">OP</div>
          </div>
        </header>
        <div className="content">
          {!['Email Process','Tracking Delivery','Submit All Process','Check List'].includes(page) && <div className="heading">
            <div>
              <div className="eyebrow">OPERATIONS MANAGEMENT SYSTEM</div>
              <h1>{title}</h1>
              <p>
                {page === 'Overview'
                  ? 'Your operations, documents and workflows — all in one place.'
                  : page === 'Data Store'
                    ? 'Manage process records, verify documents and transfer work.'
                    : 'Dedicated workspace for ' + page.toLowerCase() + '.'}
              </p>
            </div>
            {page === 'Data Store' && <button
              className="primary"
              onClick={() => {
                setSelected(null);
                setPickFile(null);
                setDraft({ process: '', party: '', so: '' });
                setModal('create');
              }}
            >
              <Plus size={17} /> New process
            </button>}
          </div>}
          {notice && (
            <div className="notice">
              {notice}
              <button onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {page === 'Overview' && (
            <>
              <div className="metrics">
                <div className="metric">
                  <div className="metriclabel">
                    Total processes <Database size={18} />
                  </div>
                  <strong>{records.length.toString().padStart(2, '0')}</strong>
                  <span>Master records</span>
                </div>
                <div className="metric">
                  <div className="metriclabel">
                    Ready for action <CheckCircle2 size={18} />
                  </div>
                  <strong>
                    {records
                      .filter(r => r.status === 'Ready')
                      .length.toString()
                      .padStart(2, '0')}
                  </strong>
                  <span>Verified records</span>
                </div>
                <div className="metric">
                  <div className="metriclabel">
                    Needs review <AlertCircle size={18} />
                  </div>
                  <strong>
                    {records
                      .filter(r => r.status === 'Review')
                      .length.toString()
                      .padStart(2, '0')}
                  </strong>
                  <span>Require attention</span>
                </div>
                <div className="metric">
                  <div className="metriclabel">
                    Automation queue <Clock3 size={18} />
                  </div>
                  <strong>—</strong>
                  <span>Worker not connected</span>
                </div>
              </div>
              <div className="sectiontitle">
                <h2>Quick actions</h2>
                <span>Frequently used operations</span>
              </div>
              <div className="quickgrid">
                <button onClick={() => openPage('Data Store')}>
                  <span className="quickicon blue">
                    <Upload size={21} />
                  </span>
                  <b>Upload documents</b>
                  <small>Pick slip, invoice, E-Bill</small>
                  <ArrowRight size={17} />
                </button>
                <button onClick={() => openPage('Email Process')}>
                  <span className="quickicon purple">
                    <Mail size={21} />
                  </span>
                  <b>Email process</b>
                  <small>Prepare customer emails</small>
                  <ArrowRight size={17} />
                </button>
                <button onClick={() => openPage('Tracking Delivery')}>
                  <span className="quickicon green">
                    <Truck size={21} />
                  </span>
                  <b>Track delivery</b>
                  <small>Shipment status & evidence</small>
                  <ArrowRight size={17} />
                </button>
                <button onClick={() => openPage('Pending Task AI Agent')}>
                  <span className="quickicon orange">
                    <Bot size={21} />
                  </span>
                  <b>AI task agent</b>
                  <small>Alerts & pending tasks</small>
                  <ArrowRight size={17} />
                </button>
              </div>
            </>
          )}
          {false && page === 'Submit All Process' && (
            <div className="tabs">
              {['Bill Submitted', 'Email Submit', 'Tracking Submit'].map(t => (
                <button
                  onClick={() =>
                    setNotice(
                      t +
                        ' workspace is planned; no real submission is connected yet.'
                    )
                  }
                >
                  <Send size={17} />
                  {t}
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          )}
          {false && page === 'Pending Task AI Agent' && (
            <div className="agent">
              <Bot size={27} />
              <div>
                <b>AI operations assistant</b>
                <p>
                  Planned: document mismatch checks, 10-day shipment delay
                  alerts, RTO escalation, and email/WhatsApp reminders.
                </p>
              </div>
              <span>Not connected</span>
            </div>
          )}
          {false && page === 'Excel Bill & LR Finding' && (
            <div className="tabs">
              <button
                onClick={() =>
                  setNotice(
                    'Excel bill generation requires your approved output template.'
                  )
                }
              >
                <FileSpreadsheet />
                Create Excel Bill
                <ArrowRight size={16} />
              </button>
              <button
                onClick={() =>
                  setNotice(
                    'TCI / VExpress LR matching will use uploaded courier bills and Data Store records.'
                  )
                }
              >
                <Search />
                TCI & VExpress LR Finding
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {page === 'Excel Bill & LR Finding' && <ExcelLRWorkspace records={records}/>}
          {page === 'Pending Task AI Agent' && <PendingChecks records={records} onOpen={r=>{setSelected(r);setModal('edit')}}/>}
          {false && page === 'Check List' && (
            <div className="agent">
              <ListChecks />
              <div>
                <b>Items needing attention</b>
                <p>
                  Review missing documents, incorrect attachments, tracking
                  exceptions and submission failures.
                </p>
              </div>
              <span>Planning</span>
            </div>
          )}
          {['Email Process', 'Tracking Delivery', 'Submit All Process','Check List'].includes(page) && <PJSOriginalPages key={page+'-'+refreshKey} page={page} onNotice={setNotice} />}
          {page === 'Overview' && <OverviewProcessSearch records={records} query={query} setQuery={setQuery} onOpen={r=>{setSelected(r);setModal('edit')}}/>}
          {!['Overview','Email Process', 'Tracking Delivery', 'Submit All Process','Check List','Excel Bill & LR Finding'].includes(page) && <div className="tablecard">
            <div className="tablehead">
              <div>
                <h2>
                  {page === 'Overview'
                    ? 'Recent process records'
                    : page === 'Data Store'
                      ? 'Process data store'
                      : 'Related process records'}
                </h2>
                <p>
                  {cloudConfigured?'Private OMS records · Independent database':'Local migration preview only · Cloud not configured'}
                </p>
              </div>
              <button
                className="outline"
                onClick={() => openPage('Data Store')}
              >
                View data store <ArrowRight size={15} />
              </button>
            </div>
            <div className="tabletools">
              <div className="search">
                <Search size={17} />
                <input
                  placeholder="Search process, party or invoice..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
              <button
                className="outline"
                onClick={() => {
                  setNotice('Upload a Pick Slip to extract Process No., Party Name, and SO No.');
                  document.getElementById('pickUpload').click();
                }}
              >
                <Upload size={16} /> Upload Pick Slip
              </button>
              <input
                id="pickUpload"
                type="file"
                accept=".pdf,image/*"
                hidden
                onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setPickFile(file);setNotice('Reading Pick Slip...');try{const f=await cloud.extract(file,'pickDoc');setDraft({process:f.process||'',party:f.party||'',so:f.so||''});setSelected(null);setModal('create');setNotice(cloudConfigured?'Verify these three fields before saving the process and original Pick Slip.':'Three fields extracted. Browser preview only: the PDF is NOT stored until Supabase is connected.')}catch{setDraft({process:'',party:'',so:''});setSelected(null);setModal('create');setNotice('Could not read this Pick Slip. Enter all three fields manually and review the PDF.')}e.target.value=''}}
              />
            </div>
            <div className={'tablewrap '+(page==='Data Store'?'datastore-scroll':'')}>
              <table>
                <thead>
                  <tr>
                    <th>PROCESS NO.</th>
                    <th>PARTY NAME</th>
                    <th>INVOICE NO.</th>
                    <th>FILES</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td className="process">{r.process}</td>
                      <td>{r.party || '—'}</td>
                      <td>{r.invoice || '—'}</td>
                      <td>
                        <FileText size={15} /> {r.docs} files
                      </td>
                      <td>
                        <span className={'badge ' + r.status.toLowerCase()}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="link"
                          onClick={() => {
                            setSelected(r);
                            setDraft({process:r.process,party:r.party,so:r.so||''});
                            setModal('edit');
                          }}
                        >
                          Open / Edit
                        </button>
                        <button
                          className="link"
                          onClick={() => {
                            setSelected(r);
                            setDest({
                              email: r.email,
                              tracking: r.tracking,
                              bill: r.bill,
                            });
                            setModal('transfer');
                          }}
                        >
                          Transfer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="empty">No matching records</div>
              )}
            </div>
            <div className="tablefooter">
              Showing {filtered.length} of {records.length} {cloudConfigured?'cloud':'local preview'} records{' '}
              <span>{cloudConfigured?'OMS Cloud':'Local only'}</span>
            </div>
          </div>}
        </div>
      </div>
      {modal === 'edit' && selected && <ProcessEditor record={selected} onClose={()=>setModal('')} onSave={async()=>{await refreshRecords();setModal('');setNotice(cloudConfigured?'Saved to independent cloud.':'Saved locally in this browser only.')}} onDelete={async()=>{if(window.confirm('Permanently delete process and documents?')){try{await cloud.remove(selected.id);await refreshRecords();setModal('')}catch{setNotice('Delete failed.')}}}}/>}
      {modal && modal !== 'edit' && (
        <div
          className="overlay"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setModal('');
          }}
        >
          <div className="dialog">
            <div className="dialogtop">
              <div>
                <small>DATA STORE</small>
                <h2>
                  {modal === 'transfer'
                    ? 'Transfer process'
                    : modal === 'edit'
                      ? 'Edit process'
                      : 'Create process'}
                </h2>
              </div>
              <button className="iconbutton" onClick={() => setModal('')}>
                <X />
              </button>
            </div>
            {modal === 'transfer' ? (
              <>
                <p className="muted">
                  Choose where to send {selected?.process}. This preview updates
                  only local interface state.
                </p>
                {[
                  ['email', 'Email Process'],
                  ['tracking', 'Tracking Delivery'],
                  ['bill', 'Bill Submission'],
                ].map(([key, label]) => (
                  <label className="checkrow">
                    <input
                      type="checkbox"
                      checked={dest[key]}
                      onChange={e =>
                        setDest({ ...dest, [key]: e.target.checked })
                      }
                    />
                    {label}
                  </label>
                ))}
                <button
                  className="primary wide"
                  onClick={() => {
                    cloud.save({...selected,...dest}).then(()=>{refreshRecords();setModal('');setNotice('Transfer choices recorded; no automation triggered.')}).catch(()=>setNotice('Transfer save failed.'));
                  }}
                >
                  Save transfer selection <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <>
                <p className="muted">
                  Process number comes from the Pick Slip. Verify extracted
                  information before saving.
                </p>
                <label className="field">
                  Process Number{' '}
                  <input
                    value={draft.process}
                    onChange={e =>
                      setDraft({ ...draft, process: e.target.value })
                    }
                    placeholder="e.g. 292184"
                  />
                </label>
                <label className="field">
                  Party Name{' '}
                  <input
                    value={draft.party}
                    onChange={e =>
                      setDraft({ ...draft, party: e.target.value })
                    }
                    placeholder="Customer / party"
                  />
                </label>
                <label className="field">
                  SO No.{' '}
                  <input
                    value={draft.so}
                    onChange={e =>
                      setDraft({ ...draft, so: e.target.value })
                    }
                    placeholder="Sales Order number"
                  />
                </label>
                <div className="dialogactions">
                  <button className="outline" onClick={() => setModal('')}>
                    Cancel
                  </button>
                  <button className="primary" onClick={save}>
                    Save process
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
