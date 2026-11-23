// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { KitProvider } from './text';
import { defineMessages } from './locales';
import { createTranslations, useTranslations } from './translations';

const messages = {
  billing: defineMessages({
    en: { title: 'Billing', invoices_one: '{count} invoice', invoices_other: '{count} invoices', hello: 'Hello {name}' },
    de: { title: 'Abrechnung', invoices_one: '{count} Rechnung', invoices_other: '{count} Rechnungen' },
    ro: { title: 'Facturare', invoices_one: '{count} factură', invoices_few: '{count} facturi', invoices_other: '{count} de facturi' },
  }),
};

describe('translations', () => {
  it('translates a plugin’s own namespaces with plurals, English fallback and placeholders', () => {
    const ro = createTranslations(messages, 'ro');
    expect(ro.t('billing.title')).toBe('Facturare');
    expect(ro.t('billing.invoices', { count: 1 })).toBe('1 factură');
    expect(ro.t('billing.invoices', { count: 3 })).toBe('3 facturi');
    expect(ro.t('billing.invoices', { count: 25 })).toBe('25 de facturi');
    expect(ro.t('billing.hello', { name: 'Ana' })).toBe('Hello Ana');
    expect(createTranslations(messages, 'de').t('billing.invoices', { count: 1200 })).toBe('1.200 Rechnungen');
  });

  it('follows the kit’s language', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <KitProvider locale="de">{children}</KitProvider>;
    const { result } = renderHook(() => useTranslations(messages), { wrapper });
    expect(result.current.locale).toBe('de');
    expect(result.current.t('billing.title')).toBe('Abrechnung');
  });
});
