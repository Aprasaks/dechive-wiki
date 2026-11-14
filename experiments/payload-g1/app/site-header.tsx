import ArchiveIcon from './archive-icon'
const navigation = [
  {label:'Explore',icon:'compass',href:'#explore'},
  {label:'Categories',icon:'grid',href:'#domains'},
  {label:'Timeline',icon:'timeline',href:'#today'},
  {label:'Books',icon:'book'},
  {label:'Papers',icon:'paper'},
  {label:'People',icon:'people'},
  {label:'Topics',icon:'tag',href:'#domains'},
  {label:'Random',icon:'dice',href:'#random'},
  {label:'Latest Revisions',icon:'clock',href:'#verified'},
]

export default function SiteHeader(){
 return (
    <header className="ref-header" aria-label="Site header">
      <a href="/" className="ref-brand" aria-label="DECHIVE.WIKI home">
        <ArchiveIcon name="library" size={30}/>
        <span>DECHIVE.WIKI</span>
      </a>
      <div className="ref-header-split" aria-hidden="true"/>
      <nav className="ref-nav" aria-label="Main navigation">
        {navigation.map(item=>item.href?
          <a key={item.label} href={item.href?.startsWith('#')?'/'+item.href:item.href}
            className={item.label==='Explore'?'ref-nav-active':''}>
            <ArchiveIcon name={item.icon} size={20}/>{item.label}
          </a>:
          <span key={item.label} className="ref-nav-disabled" aria-disabled="true"
            title="This section is not available in the current preview">
            <ArchiveIcon name={item.icon} size={20}/>{item.label}
          </span>
        )}
      </nav>
      <div className="ref-header-split ref-header-split-right" aria-hidden="true"/>
      <div className="ref-tools" aria-label="Additional features in development">
        <span title="Bookmarks: not yet available"><ArchiveIcon name="bookmark" size={21}/></span>
        <span title="Notifications: not yet available"><ArchiveIcon name="bell" size={21}/></span>
        <span title="Account: staff-only access in this preview"><ArchiveIcon name="user" size={21}/></span>
      </div>
    </header>

 )
}
