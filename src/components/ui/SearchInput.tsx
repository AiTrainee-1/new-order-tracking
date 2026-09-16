"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import styled from "styled-components";

/**
 * Glassy layered-gradient search pill (outer glow ring → bevelled inner pill
 * → recessed field), the same construction as the reference "kawaii" search
 * box, retuned onto the app's own brand blue instead of its pastel palette
 * so it reads as part of this design system rather than a foreign pastel
 * swatch. The reference's icon (`fill: white` on a near-white pill) is all
 * but invisible against its own background - fixed here by filling the icon
 * with the brand colour instead, since a search box you can't see the icon
 * on isn't a faithful port, just a broken one.
 */
const Container = styled.div`
  position: relative;
  display: grid;
  border-radius: 999px;
  padding: 3px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-brand) 22%, #fff) 0%, color-mix(in srgb, var(--color-brand) 34%, #fff) 100%);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
`;

const Pill = styled.div`
  position: relative;
  z-index: 0;
  display: flex;
  align-items: center;
  width: 100%;
  border-radius: 999px;
  padding: 3px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-brand) 7%, #fff) 0%, color-mix(in srgb, var(--color-brand) 13%, #fff) 100%);

  &::before,
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  &::before {
    top: -1px;
    left: -1px;
    background: linear-gradient(0deg, color-mix(in srgb, var(--color-brand) 13%, #fff) 0%, #fff 100%);
    z-index: -1;
  }
  &::after {
    bottom: -1px;
    right: -1px;
    background: linear-gradient(0deg, color-mix(in srgb, var(--color-brand) 42%, #fff) 0%, color-mix(in srgb, var(--color-brand) 16%, #fff) 100%);
    box-shadow:
      rgba(21, 94, 239, 0.28) 2px 2px 6px 0px,
      rgba(21, 94, 239, 0.22) 4px 6px 18px 0px;
    z-index: -2;
  }
`;

const StyledInput = styled.input`
  flex: 1 1 auto;
  min-width: 0;
  padding: 9px 4px 9px 14px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-brand) 7%, #fff) 0%, color-mix(in srgb, var(--color-brand) 13%, #fff) 100%);
  border: none;
  border-radius: 999px;
  color: color-mix(in srgb, var(--color-brand) 60%, #334155);
  font-size: 0.875rem;
  font-weight: 500;
  outline: none;

  &::placeholder {
    color: color-mix(in srgb, var(--color-brand) 30%, #94a3b8);
    font-weight: 400;
  }

  &:focus {
    background: linear-gradient(135deg, #fff 0%, color-mix(in srgb, var(--color-brand) 10%, #fff) 100%);
  }
`;

const IconWrap = styled.span`
  display: flex;
  aspect-ratio: 1;
  height: 30px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  margin-right: 4px;
  border-radius: 50%;
  border-left: 2px solid color-mix(in srgb, var(--color-brand) 30%, #fff);
  transition: border-color 0.15s ease;

  svg {
    width: 14px;
    height: 14px;
  }
  path {
    fill: var(--color-brand);
  }

  ${Pill}:focus-within & {
    border-left: 2px solid var(--color-brand);
  }
`;

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(({ label, className = "", ...rest }, ref) => (
  <label className={`block ${className}`}>
    {label && <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-600">{label}</span>}
    <Container>
      <Pill>
        <StyledInput ref={ref} type="text" {...rest} />
        <IconWrap>
          <svg viewBox="0 0 24 24">
            <path d="M21.53 20.47l-3.66-3.66C19.195 15.24 20 13.214 20 11c0-4.97-4.03-9-9-9s-9 4.03-9 9 4.03 9 9 9c2.215 0 4.24-.804 5.808-2.13l3.66 3.66c.147.146.34.22.53.22s.385-.073.53-.22c.295-.293.295-.767.002-1.06zM3.5 11c0-4.135 3.365-7.5 7.5-7.5s7.5 3.365 7.5 7.5-3.365 7.5-7.5 7.5-7.5-3.365-7.5-7.5z" />
          </svg>
        </IconWrap>
      </Pill>
    </Container>
  </label>
));
SearchInput.displayName = "SearchInput";
