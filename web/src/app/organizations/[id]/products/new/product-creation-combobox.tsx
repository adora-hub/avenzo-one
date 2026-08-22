'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export type ProductCreationComboboxOption = {
  value: string
  label: string
  description?: string
}

type Props = {
  id: string
  value: string
  options: ProductCreationComboboxOption[]
  disabled?: boolean
  ariaLabel?: string
  onChange: (value: string) => void
}

export function ProductCreationCombobox({
  id, value, options, disabled = false, ariaLabel, onChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex)
  const selectedOption = options[selectedIndex]

  useEffect(() => {
    if (!open) setHighlightedIndex(selectedIndex)
  }, [open, selectedIndex])

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [])

  function choose(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || !options.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setHighlightedIndex(selectedIndex)
        return
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setHighlightedIndex((current) => (current + direction + options.length) % options.length)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex(event.key === 'Home' ? 0 : options.length - 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(highlightedIndex)
      else setOpen(true)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === 'Tab') setOpen(false)
  }

  return <div className="product-creation-combobox" ref={rootRef}>
    <button
      ref={triggerRef}
      id={id}
      className="product-creation-combobox-trigger"
      type="button"
      role="combobox"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={`${id}-options`}
      aria-activedescendant={open ? `${id}-option-${highlightedIndex}` : undefined}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={handleKeyDown}
    >
      <span className="product-creation-combobox-value">
        <strong>{selectedOption?.label ?? 'เลือกรายการ'}</strong>
        {selectedOption?.description ? <small>{selectedOption.description}</small> : null}
      </span>
      <span className="product-creation-combobox-arrow" aria-hidden="true" />
    </button>
    {open ? <div id={`${id}-options`} className="product-creation-combobox-options" role="listbox">
      {options.map((option, index) => <button
        id={`${id}-option-${index}`}
        key={option.value}
        className={highlightedIndex === index ? 'is-highlighted' : ''}
        type="button"
        role="option"
        aria-selected={option.value === value}
        onMouseEnter={() => setHighlightedIndex(index)}
        onClick={() => choose(index)}
      >
        <span className="product-creation-combobox-check" aria-hidden="true">{option.value === value ? '✓' : ''}</span>
        <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
      </button>)}
    </div> : null}
  </div>
}
