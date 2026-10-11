import { useState, type ReactNode } from 'react';
import { useLanguage } from '../language/LanguageContext';

export type WelcomeRepo = {
  meta: { id: string; name: string; isLocked: boolean; createdAt: number };
  tabs: { isDeleted?: boolean }[];
  peoples: unknown[];
  documents: unknown[];
  accounts: unknown[];
  contacts: unknown[];
};

type Props = {
  repo: WelcomeRepo;
  repoPassword: string | null;
  onOpenTabsPanel: () => void;
  /** إغلاق المستودع والعودة لقائمة المستودعات. */
  onCloseRepo: () => void;
  /** Pass the existing Tauri dialog + exportRepoDb flow here. */
  onExportDb: (id: string, password: string | null) => Promise<void>;
  /** Pass the existing Tauri dialog + confirmation + importRepoDb flow here. */
  onImportDb: (id: string, password: string | null) => Promise<void>;
  onError?: (error: unknown) => void;
};

function Icon({ kind }: { kind: 'repo' | 'lock' | 'tabs' | 'close' | 'export' | 'import' }) {
  const paths: Record<string, ReactNode> = {
    repo: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    tabs: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16M7 9h4M7 13h4" /></>,
    close: <><path d="M6 6l12 12M18 6L6 18" /></>,
    export: <><path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5" /></>,
    import: <><path d="M12 3v13m-4-4 4 4 4-4M4 15v5h16v-5" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export default function PanelWelcomeRepo({ repo, repoPassword, onOpenTabsPanel, onCloseRepo, onExportDb, onImportDb, onError }: Props) {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [error, setError] = useState('');
  const counts = [
    ['Tabs', repo.tabs.filter((tab) => !tab.isDeleted).length],
    ['Records', repo.peoples.length],
    ['Files', repo.documents.length],
    ['Accounts', repo.accounts.length],
    ['Contacts', repo.contacts.length],
  ] as const;
  const date = new Date(repo.meta.createdAt * 1000);
  let createdAt = '';
  if (Number.isFinite(date.getTime())) {
    try { createdAt = date.toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { createdAt = date.toLocaleDateString(); }
  }
  const run = async (operation: 'export' | 'import') => {
    if (busy) return;
    setBusy(operation);
    setError('');
    try {
      await (operation === 'export' ? onExportDb : onImportDb)(repo.meta.id, repoPassword);
    } catch (cause) {
      if (onError) onError(cause);
      else setError(cause instanceof Error ? cause.message : 'تعذّر إتمام العملية');
    } finally { setBusy(null); }
  };

  return (
    <section className="repo-welcome w-full text-ink" aria-label={t('repoWelcome.sectionAria')} aria-busy={busy !== null}>
      <header className="flex flex-wrap items-start gap-3 pb-[22px] pt-2 sm:flex-nowrap sm:gap-4 sm:pb-7">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[6px] border border-line bg-paper text-green [&_svg]:h-6 [&_svg]:w-6"><Icon kind={repo.meta.isLocked ? 'lock' : 'repo'} /></span>
        <div className="min-w-0 flex-1">
          <p className="mb-[5px] mt-0 text-xs text-text-muted">{t('repoWelcome.kicker')}</p>
          <h2 className="m-0 mb-2 text-[22px] font-semibold leading-normal wrap-anywhere sm:text-2xl" dir="auto">{repo.meta.name}</h2>
          <span className={`inline-flex items-center gap-[7px] text-xs ${repo.meta.isLocked ? 'text-orange' : 'text-green'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{t(repo.meta.isLocked ? 'pageHome.statusLocked' : 'pageHome.statusOpen')}</span>
        </div>
        <dl className="m-0 mt-1 flex basis-full flex-wrap gap-x-3 gap-y-1 sm:mt-[5px] sm:block sm:max-w-[220px] sm:basis-auto"><dt className="text-xs text-text-muted sm:mb-[7px]">{t('pageHome.createdAt')}</dt><dd className="m-0 text-[13px] leading-[1.7]" dir="auto">{createdAt}</dd></dl>
      </header>

      <dl className="m-0 mb-7 grid grid-cols-2 gap-2.5 sm:grid-cols-5" aria-label={t('repoWelcome.statsAria')}>
        {counts.map(([key, count]) => <div className="min-w-0 rounded-[6px] border border-line bg-paper px-4 py-[18px] max-sm:last:col-span-2 max-sm:last:flex max-sm:last:items-center max-sm:last:justify-between" key={key}><dt className="text-xs leading-[1.7] text-text-muted">{t(`repoWelcome.stats${key}`)}</dt><dd className="m-0 mt-3 text-start font-[DM_Mono,monospace] text-[28px] leading-[1.3] wrap-anywhere max-sm:in-[:last-child]:mt-0" dir="ltr">{count.toLocaleString('en-US')}</dd></div>)}
      </dl>

      <footer className="flex flex-wrap justify-between gap-3 border-t border-line pt-[22px]">
        <div className="flex w-full gap-3 max-[359px]:flex-col">
          <button className="inline-flex min-h-[54px] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-[6px] border px-5 py-3 whitespace-nowrap text-[16px] font-medium cursor-pointer transition-colors hover:border-green focus-visible:outline-2 focus-visible:outline-green focus-visible:outline-offset-3 disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none [&_svg]:h-[20px] [&_svg]:w-[20px] [&_svg]:shrink-0 border-green bg-green text-white!" type="button" onClick={onOpenTabsPanel}><Icon kind="tabs" />{t('pageRepoViewer.openTabsPanelBtn')}</button>
          <button className="inline-flex min-h-[54px] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-[6px] border px-5 py-3 whitespace-nowrap text-[16px] font-medium cursor-pointer transition-colors hover:border-green focus-visible:outline-2 focus-visible:outline-green focus-visible:outline-offset-3 disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none [&_svg]:h-[20px] [&_svg]:w-[20px] [&_svg]:shrink-0 border-line bg-paper text-ink" type="button" onClick={onCloseRepo} aria-label={t('pageMother.closeRepoTitle')}><span className="grid shrink-0 place-items-center text-[#c8443c] dark:text-[#e88d86]"><Icon kind="close" /></span>{t('pageMother.closeRepoBtn')}</button>
        </div>
        <div className="flex w-full flex-wrap gap-2 max-[359px]:flex-col sm:w-auto [&>button]:min-w-0 [&>button]:flex-1">
          <button className="inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-[6px] border px-5 py-3 whitespace-nowrap text-[15px] font-medium cursor-pointer transition-colors hover:border-green focus-visible:outline-2 focus-visible:outline-green focus-visible:outline-offset-3 disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none [&_svg]:h-[20px] [&_svg]:w-[20px] [&_svg]:shrink-0 border-line bg-paper text-ink" type="button" disabled={busy !== null} onClick={() => void run('export')}><Icon kind="export" />{t('repoWelcome.exportDbBtn')}{busy === 'export' && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-e-transparent motion-reduce:animate-none" />}</button>
          <button className="inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-[6px] border px-5 py-3 whitespace-nowrap text-[15px] font-medium cursor-pointer transition-colors hover:border-green focus-visible:outline-2 focus-visible:outline-green focus-visible:outline-offset-3 disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none [&_svg]:h-[20px] [&_svg]:w-[20px] [&_svg]:shrink-0 border-line bg-paper text-ink" type="button" disabled={busy !== null} onClick={() => void run('import')}><Icon kind="import" />{t('repoWelcome.importDbBtn')}{busy === 'import' && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-e-transparent motion-reduce:animate-none" />}</button>
        </div>
      </footer>
      {error && <p className="text-[13px] text-orange" role="alert">{error}</p>}
    </section>
  );
}