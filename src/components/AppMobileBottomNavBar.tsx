// شريط التنقل السفلي للهواتف (أقل من 640px — عتبة sm).
// خمسة أزرار: درايف (محجوز للمزامنة) | بحث | الرئيسية (وسط بارز) | المفضلة | الذكاء.
// يحترم أزرار النظام عبر padding-bottom بـ env(safe-area-inset-bottom).
// يحترم أزرار النظام عبر padding-bottom بـ env(safe-area-inset-bottom).
import { House, Search, Sparkles, Star } from 'lucide-react'
import { useLanguage } from '../language/LanguageContext'
import type { PageName } from '../pages/PageMother'
import { Tooltip } from './Tooltip'

/** شعار Google Drive الرسمي (أحادي اللون ليناسب الشريط — لا يوجد في lucide). */
function GoogleDriveIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z" />
    </svg>
  )
}

type AppMobileBottomNavBarProps = {
  page: PageName
  onGoHome: () => void
  onOpenPrompt: () => void
  onOpenSearch: () => void
  onOpenFavorites: () => void
  /** عرض المفضلة فقط نشط؟ */
  favOnlyActive: boolean
}

const NAV_BTN =
  'grid size-12 flex-none cursor-pointer place-items-center rounded-xl border-0 bg-transparent p-0 ' +
  'text-[#63716d] transition-colors duration-[120ms] active:bg-[#e9eeea] ' +
  'focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-[-3px] ' +
  'disabled:pointer-events-none disabled:opacity-35 ' +
  'dark:text-[#b4c1b9] dark:active:bg-[#36363c]'

const NAV_BTN_ACTIVE = 'bg-[#edf4ef] text-green dark:bg-[#2c3530] dark:text-[#a5d4b9]'

const NAV_HOME =
  'grid size-14 flex-none -translate-y-2 cursor-pointer place-items-center rounded-full border-0 p-0 ' +
  'bg-green text-white! shadow-[0_6px_16px_#16715f55] transition-colors duration-[120ms] active:bg-[#105b4d] ' +
  'focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-2 ' +
  'dark:bg-[#2f7a68] dark:active:bg-[#256052]'

export default function AppMobileBottomNavBar({
  page,
  onGoHome,
  onOpenPrompt,
  onOpenSearch,
  onOpenFavorites,
  favOnlyActive,
}: AppMobileBottomNavBarProps) {
  const { t } = useLanguage()

  return (
    <nav
      aria-label={t('mobileNav.navAria')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      className="bottom-nav relative z-[1000] flex-none select-none border-t border-[#e8ebe7] bg-white/98 shadow-[0_-2px_8px_#1d343008] sm:hidden dark:border-[#36363b] dark:bg-[#19191cf5] no-icon-scale"
    >
      {/* قوس يحتضن بروز زر الهوم: يغطي خط الحد العلوي خلف الزر ويرسم قوساً حوله —
          فيبدو وسط البار كتجويف يحيط بالجزء الظاهر من الزر. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 120 28"
        className="pointer-events-none absolute -top-5 left-1/2 h-7 w-[120px] -translate-x-1/2"
      >
        <path
          d="M0,28 L0,20 H30 C42,20 44,12 60,12 C76,12 78,20 90,20 H120 L120,28 Z"
          className="fill-white/98 dark:fill-[#19191cf5]"
        />
        <path
          d="M30,20 C42,20 44,12 60,12 C76,12 78,20 90,20"
          fill="none"
          strokeWidth="1"
          className="stroke-[#e8ebe7] dark:stroke-[#36363b]"
        />
      </svg>
      <div className="relative z-[1] flex w-full items-end justify-around px-2 pt-1.5">
        {/* TODO: زر درايف — أيقونة فقط بلا عمل حالياً. */}
        <Tooltip content={t('mobileNav.soonBtn')} position="bottom">
          <button
            type="button"
            className={NAV_BTN}
            aria-label={t('mobileNav.soonBtn')}
          >
            <GoogleDriveIcon size={20} />
          </button>
        </Tooltip>
        {/* زر البحث العام عن الأشخاص — صفحة مستقلة (plan/GlobalSearch.md). */}
        <Tooltip content={t('mobileNav.searchBtn')} position="bottom">
          <button
            type="button"
            className={`${NAV_BTN} ${page === 'search' ? NAV_BTN_ACTIVE : ''}`}
            aria-label={t('mobileNav.searchBtn')}
            aria-current={page === 'search' ? 'page' : undefined}
            onClick={onOpenSearch}
          >
            <Search size={20} strokeWidth={1.7} />
          </button>
        </Tooltip>
        <Tooltip content={t('mobileNav.homeBtn')} position="bottom">
          <button
            type="button"
            className={NAV_HOME}
            aria-label={t('mobileNav.homeBtn')}
            aria-current={page === 'home' ? 'page' : undefined}
            onClick={onGoHome}
          >
            <House size={26} strokeWidth={1.8} />
          </button>
        </Tooltip>
        <Tooltip content={t('pageHome.favoritesBtn')} position="bottom">
          <button
            type="button"
            className={`${NAV_BTN} ${favOnlyActive ? NAV_BTN_ACTIVE : ''}`}
            aria-label={t('pageHome.favoritesBtn')}
            aria-pressed={favOnlyActive}
            onClick={onOpenFavorites}
          >
            <Star size={20} strokeWidth={1.7} className={favOnlyActive ? 'fill-[#eab308] text-[#eab308]' : undefined} />
          </button>
        </Tooltip>
        {/*
          زر صفحة البرومبت والاستيراد الذكي (PagePrompt) — مرجعية الخطة: plan/Finished/ai_prompt_extract_text.md
        */}
        <Tooltip content={t('promptPage.navTitle')} position="bottom">
          <button
            type="button"
            className={`${NAV_BTN} ${page === 'prompt' ? NAV_BTN_ACTIVE : ''}`}
            aria-label={t('promptPage.navTitle')}
            aria-current={page === 'prompt' ? 'page' : undefined}
            onClick={onOpenPrompt}
          >
            <Sparkles size={20} strokeWidth={1.7} />
          </button>
        </Tooltip>
      </div>
    </nav>
  )
}
