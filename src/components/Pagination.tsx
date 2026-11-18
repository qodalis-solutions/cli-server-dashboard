import { useI18n } from '../i18n';
import Select from './Select';
import { PAGE_SIZES, clampPage, pageCount, pageRange } from './paging';

interface Props {
  /** 0-based. */
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

const BUTTON = 'px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40';

/** Page controls under a list: rows per page, which rows are shown, previous and next. Nothing for one short page. */
export default function Pagination({ page, pageSize, total, onPage, onPageSize }: Props) {
  const { t, formatNumber } = useI18n();
  if (total <= PAGE_SIZES[0]) return null;
  const current = clampPage(page, total, pageSize);
  const pages = pageCount(total, pageSize);
  const { from, to } = pageRange(current, pageSize, total);
  return (
    <nav aria-label={t('components.pagination')} className="flex flex-wrap items-center justify-between gap-3 mt-3 text-xs text-subtle">
      <label className="flex items-center gap-2">
        {t('components.rowsPerPage')}
        <Select
          options={PAGE_SIZES.map(size => ({ value: String(size), label: formatNumber(size) }))}
          value={String(pageSize)}
          onChange={size => onPageSize(Number(size))}
          width="auto"
        />
      </label>
      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          {t('components.pageRange', { from: formatNumber(from), to: formatNumber(to), total: formatNumber(total) })}
        </span>
        <button onClick={() => onPage(current - 1)} disabled={current === 0} className={BUTTON}>{t('components.previousPage')}</button>
        <span className="tabular-nums">{t('components.pageOf', { page: formatNumber(current + 1), pages: formatNumber(pages) })}</span>
        <button onClick={() => onPage(current + 1)} disabled={current >= pages - 1} className={BUTTON}>{t('components.nextPage')}</button>
      </div>
    </nav>
  );
}
