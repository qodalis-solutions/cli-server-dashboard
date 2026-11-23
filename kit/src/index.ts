// @qodalis/cli-server-dashboard-kit: the dashboard's shared components, theme and extension API.

// Extensions
export { defineExtension, useDashboard, useApi, useServerEvents, createApi, ApiError } from './extension/defineExtension';
export type { ExtensionApi } from './extension/defineExtension';
export type { DashboardExtension, DashboardExtensionContext, DashboardExtensionInfo, DashboardTheme } from './extension/types';

// Language of the components
export { KitProvider, useKitLocale, useKitText } from './i18n/text';
export type { KitTextKey, KitTextParams } from './i18n/text';
export { default as kitMessages } from './i18n/messages';
export { LOCALES, isLocale, defineMessages } from './i18n/locales';
// An extension's own texts (each plugin ships its messages)
export { useTranslations, createTranslations } from './i18n/translations';
export type { TranslationKey, TranslationParams, Translations } from './i18n/translations';
export type { Locale, NamespaceMessages, PluralSuffix, StripPlural } from './i18n/locales';

// Theme
export * from './theme/tokens';

// Components
export { default as Badge } from './components/Badge';
export { default as ButtonGroup } from './components/ButtonGroup';
export type { ButtonGroupItem, ButtonGroupLabels, ButtonGroupTone } from './components/ButtonGroup';
export { default as ConfirmDialog } from './components/ConfirmDialog';
export type { ConfirmDialogProps } from './components/ConfirmDialog';
export { useConfirm } from './components/useConfirm';
export type { ConfirmOptions } from './components/useConfirm';
export { default as DataTable } from './components/DataTable';
export { sortRows } from './components/sortRows';
export type { SortState, SortValue } from './components/sortRows';
export { PAGE_SIZES, DEFAULT_PAGE_SIZE, parsePageSize, pageCount, clampPage, pageRange, pageSlice } from './components/paging';
export { default as Pagination } from './components/Pagination';
export { default as DropdownMenu, MENU_SEPARATOR } from './components/DropdownMenu';
export type { DropdownMenuItem } from './components/DropdownMenu';
export { default as ErrorBoundary } from './components/ErrorBoundary';
export { default as Modal } from './components/Modal';
export type { ModalProps, ModalSize } from './components/Modal';
export { default as MonoPanel } from './components/MonoPanel';
export { default as PageHeader } from './components/PageHeader';
export { Select, MultiSelect } from './components/Select';
export type { SelectOption, SelectProps, MultiSelectProps, SelectSize, SelectWidth } from './components/Select';
export { default as StatCard } from './components/StatCard';
export { default as Tooltip } from './components/Tooltip';
export { DetailsIcon, LogsIcon, RunAgainIcon, DeleteIcon, DownloadIcon, RevokeIcon } from './components/actionIcons';
export {
    usePopoverPosition,
    useDismiss,
    useBodyScrollLock,
    useTypeahead,
    nextEnabled,
    firstEnabled,
    lastEnabled,
    isTypeaheadKey,
} from './components/overlay';
export type { PopoverPosition } from './components/overlay';
export { focusableIn, trapFocusTarget, SWIPE_CLOSE_DISTANCE, isSwipeLeft } from './components/drawerGestures';
