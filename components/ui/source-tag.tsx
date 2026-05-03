import { Linkedin, Globe, MessageCircle, UserCheck } from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  linkedin: Linkedin,
  naukri: Globe,
  indeed: Globe,
  whatsapp: MessageCircle,
  referred: UserCheck,
  careers_page: Globe,
};

const LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  naukri: 'Naukri',
  indeed: 'Indeed',
  whatsapp: 'WhatsApp',
  referred: 'Referred',
  careers_page: 'Careers page',
};

export function SourceTag({ source }: { source: string }) {
  const key = source.toLowerCase();
  const Icon = ICONS[key] ?? Globe;
  const label = LABELS[key] ?? source;
  return (
    <span className="group inline-flex items-center gap-1.5 text-sm text-slate-600">
      <Icon className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-brand-500" />
      {label}
    </span>
  );
}
