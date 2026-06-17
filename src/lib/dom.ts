type Child = Node | string | number | undefined | null | false;

interface ElementOptions {
  className?: string;
  text?: string;
  title?: string;
  type?: string;
  value?: string;
  name?: string;
  id?: string;
  htmlFor?: string;
  checked?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  onInput?: (event: Event) => void;
  onChange?: (event: Event) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: Child[] = []
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.title) element.title = options.title;
  if (options.id) element.id = options.id;
  if (options.ariaLabel) element.setAttribute("aria-label", options.ariaLabel);
  if (options.htmlFor && element instanceof HTMLLabelElement) element.htmlFor = options.htmlFor;
  if (options.type && element instanceof HTMLInputElement) element.type = options.type;
  if (options.name && element instanceof HTMLInputElement) element.name = options.name;
  if (options.value !== undefined && element instanceof HTMLInputElement) element.value = options.value;
  if (options.placeholder && element instanceof HTMLInputElement) element.placeholder = options.placeholder;
  if (options.checked !== undefined && element instanceof HTMLInputElement) element.checked = options.checked;
  if (options.disabled !== undefined && "disabled" in element) element.disabled = options.disabled;
  if (options.onClick) element.addEventListener("click", options.onClick as EventListener);
  if (options.onInput) element.addEventListener("input", options.onInput);
  if (options.onChange) element.addEventListener("change", options.onChange);

  appendChildren(element, children);
  return element;
}

export function replaceChildren(element: HTMLElement, children: Child[]): void {
  element.replaceChildren();
  appendChildren(element, children);
}

function appendChildren(element: HTMLElement, children: Child[]): void {
  for (const child of children) {
    if (child === undefined || child === null || child === false) {
      continue;
    }

    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}
