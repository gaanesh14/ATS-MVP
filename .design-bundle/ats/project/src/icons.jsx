// Lightweight SVG icon set tuned for our design.
// All icons are 1em-sized strokes; pass className for color/size.

const I = ({ children, className = "w-4 h-4", strokeWidth = 1.75, viewBox = "0 0 24 24" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={viewBox}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

const Icons = {
  LayoutDashboard: (p) => <I {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></I>,
  Briefcase: (p) => <I {...p}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></I>,
  Search: (p) => <I {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></I>,
  Bell: (p) => <I {...p}><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/></I>,
  Plus: (p) => <I {...p}><path d="M12 5v14M5 12h14"/></I>,
  ChevronRight: (p) => <I {...p}><path d="m9 6 6 6-6 6"/></I>,
  ChevronLeft: (p) => <I {...p}><path d="m15 6-6 6 6 6"/></I>,
  ChevronDown: (p) => <I {...p}><path d="m6 9 6 6 6-6"/></I>,
  ChevronUp: (p) => <I {...p}><path d="m6 15 6-6 6 6"/></I>,
  ChevronsLeft: (p) => <I {...p}><path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/></I>,
  ChevronsRight: (p) => <I {...p}><path d="m13 17 5-5-5-5M6 17l5-5-5-5"/></I>,
  ArrowLeft: (p) => <I {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></I>,
  ArrowRight: (p) => <I {...p}><path d="M5 12h14M12 5l7 7-7 7"/></I>,
  ArrowUp: (p) => <I {...p}><path d="M12 19V5M5 12l7-7 7 7"/></I>,
  MapPin: (p) => <I {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></I>,
  Calendar: (p) => <I {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></I>,
  Building: (p) => <I {...p}><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01"/></I>,
  Users: (p) => <I {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2 20c.5-3.5 3.5-6 7-6s6.5 2.5 7 6"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M22 20c-.3-2-1.7-3.7-3.7-4.5"/></I>,
  DollarSign: (p) => <I {...p}><path d="M12 2v20"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></I>,
  Clock: (p) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></I>,
  Pencil: (p) => <I {...p}><path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20l-4 1 1-4Z"/></I>,
  Settings: (p) => <I {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></I>,
  MoreHorizontal: (p) => <I {...p}><circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/></I>,
  MoreVertical: (p) => <I {...p}><circle cx="12" cy="6" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="18" r="1.2"/></I>,
  X: (p) => <I {...p}><path d="M18 6 6 18M6 6l12 12"/></I>,
  Check: (p) => <I {...p}><path d="m5 12 5 5L20 7"/></I>,
  Filter: (p) => <I {...p}><path d="M3 5h18l-7 9v6l-4-2v-4Z"/></I>,
  ArrowUpDown: (p) => <I {...p}><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/></I>,
  ListIcon: (p) => <I {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></I>,
  Columns: (p) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/></I>,
  Copy: (p) => <I {...p}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></I>,
  Linkedin: (p) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 1 1 4 0v4M12 17v-7"/></I>,
  Twitter: (p) => <I {...p} viewBox="0 0 24 24"><path d="M4 4l7.5 10L4.5 20H7l6-6 4 6h4l-7.8-10.5L19.5 4H17l-5.4 5.5L8 4Z" fill="currentColor" stroke="none"/></I>,
  MessageCircle: (p) => <I {...p}><path d="M21 12a8 8 0 0 1-12 7l-5 1 1-4a8 8 0 1 1 16-4Z"/></I>,
  Share2: (p) => <I {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.5 10.5 7-4M8.5 13.5l7 4"/></I>,
  Globe: (p) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></I>,
  Star: (p) => <I {...p}><path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1L12 17l-5.5 3 1-6.1L3 9.5l6.3-.9Z"/></I>,
  Trash2: (p) => <I {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></I>,
  Upload: (p) => <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></I>,
  Download: (p) => <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></I>,
  FileText: (p) => <I {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6M9 9h2"/></I>,
  HelpCircle: (p) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4M12 17h.01"/></I>,
  Sparkles: (p) => <I {...p}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z"/><path d="M19 14l.7 1.8L21 16l-1.3.7L19 19l-.7-1.3L17 16l1.3-.5Z"/></I>,
  Target: (p) => <I {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></I>,
  TrendingUp: (p) => <I {...p}><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></I>,
  Tag: (p) => <I {...p}><path d="M20 12 13 5H4v9l7 7Z"/><circle cx="8" cy="9" r="1.2"/></I>,
  CheckSquare: (p) => <I {...p}><path d="m9 11 3 3 7-7"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/></I>,
  Square: (p) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="3"/></I>,
  GripVertical: (p) => <I {...p}><circle cx="9" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="15" cy="18" r="1.2"/></I>,
  UserCheck: (p) => <I {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2 20c.5-3.5 3.5-6 7-6s6.5 2.5 7 6"/><path d="m17 11 2 2 4-4"/></I>,
  Send: (p) => <I {...p}><path d="m22 2-7 20-4-9-9-4Z"/><path d="m22 2-11 11"/></I>,
  Phone: (p) => <I {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 3a2 2 0 0 1-.5 2.1l-1.3 1.3a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .3 2 .5 3 .6a2 2 0 0 1 1.7 2Z"/></I>,
  Mail: (p) => <I {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></I>,
  Eye: (p) => <I {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></I>,
  Refresh: (p) => <I {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></I>,
  AlertCircle: (p) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></I>,
  CheckCircle: (p) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></I>,
  Hash: (p) => <I {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></I>,
  Award: (p) => <I {...p}><circle cx="12" cy="9" r="6"/><path d="M9 14.5 7 22l5-3 5 3-2-7.5"/></I>,
  Layers: (p) => <I {...p}><path d="m12 2 10 6-10 6L2 8Z"/><path d="m2 14 10 6 10-6"/></I>,
  ChevronsUpDown: (p) => <I {...p}><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></I>,
  PanelLeft: (p) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></I>,
};

window.Icons = Icons;
