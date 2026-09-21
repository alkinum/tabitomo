import React, { useCallback, useState, useId, useRef, useEffect, createContext, useContext } from 'react';

interface TabsProps {
  defaultValue?: string;
  value?: string;
  children: React.ReactNode;
  className?: string;
  onValueChange?: (value: string) => void;
}
const TabsContext = createContext({ value: '', id: '', onValueChange: (_value: string) => {} });

export function Tabs({ defaultValue, value: controlledValue, children, className, onValueChange }: TabsProps) {
  const id = useId();
  const [internalValue, setInternalValue] = useState(defaultValue || controlledValue || '');
  const value = controlledValue ?? internalValue;
  const handleValueChange = useCallback((next: string) => {
    if (controlledValue === undefined) setInternalValue(next);
    onValueChange?.(next);
  }, [controlledValue, onValueChange]);
  return <TabsContext.Provider value={{ value, id, onValueChange: handleValueChange }}>
    <div className={className}>{children}</div>
  </TabsContext.Provider>;
}

export function TabsList({ children, className, orientation = 'horizontal', ...props }: {
  children: React.ReactNode;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
  'aria-label'?: string;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const previous = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const next = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    if (![previous, next, 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === next ? 1 : -1) + tabs.length) % tabs.length;
    tabs[target].focus();
    tabs[target].click();
  };
  return <div role="tablist" aria-orientation={orientation} className={className} onKeyDown={handleKeyDown} {...props}>{children}</div>;
}

export function TabsTrigger({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const { value: selectedValue, id, onValueChange } = useContext(TabsContext);
  const selected = selectedValue === value;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected]);
  return <button ref={ref} type="button" role="tab" id={`${id}-tab-${value}`} aria-controls={`${id}-panel-${value}`}
    aria-selected={selected} tabIndex={selected ? 0 : -1} className={className} onClick={() => onValueChange(value)}>
    {children}
  </button>;
}

export function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
  const { value: selectedValue, id } = useContext(TabsContext);
  if (selectedValue !== value) return null;
  return <div role="tabpanel" id={`${id}-panel-${value}`} aria-labelledby={`${id}-tab-${value}`} tabIndex={0}>{children}</div>;
}
