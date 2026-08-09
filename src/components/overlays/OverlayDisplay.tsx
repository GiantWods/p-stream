import classNames from "classnames";
import FocusTrap from "focus-trap-react";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Transition } from "@/components/utils/Transition";
import {
  useInternalOverlayRouter,
  useRouterAnchorUpdate,
} from "@/hooks/useOverlayRouter";
import { pushScope } from "@/utils/browser/focusScopes";
import { resolveEntryPoint } from "@/utils/navigation/entryPoint";

export interface OverlayProps {
  id: string;
  children?: ReactNode;
  darken?: boolean;
}

export function OverlayDisplay(props: { children: ReactNode }) {
  const router = useInternalOverlayRouter("hello world :)");
  const refRouter = useRef(router);

  // close router on first mount, we dont want persist routes for overlays
  useEffect(() => {
    const r = refRouter.current;
    r.close();
    return () => {
      r.close();
    };
  }, []);
  return <div className="popout-location">{props.children}</div>;
}

export function OverlayPortal(props: {
  children?: ReactNode;
  darken?: boolean;
  show?: boolean;
  close?: () => void;
  durationClass?: string;
  zIndex?: number;
}) {
  const [portalElement, setPortalElement] = useState<Element | null>(null);
  const [isReady, setIsReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // A callback ref, not useRef: the wrapper is mounted by HeadlessUI's
  // Transition on a later pass than the one that flips `show`, so an effect
  // reading a ref object finds it still null and never re-runs. State makes
  // the element's arrival itself the trigger.
  const [wrapper, setWrapperState] = useState<HTMLDivElement | null>(null);
  // The same element again, as a ref. `initialFocus` below has to be stable and
  // still see the current value: focus-trap-react hands the options to
  // `createFocusTrap` once, on the render that mounts it, which is the render
  // where the state above is still null.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const close = props.close;
  const zIndex = props.zIndex ?? 999;

  const setWrapper = useCallback((el: HTMLDivElement | null) => {
    wrapperRef.current = el;
    setWrapperState(el);
  }, []);

  /**
   * Where focus goes when the overlay opens.
   *
   * focus-trap's default is the first tabbable node, and in this wrapper that is
   * the zero-size spacer below — so every modal in the app opened with focus on
   * an invisible element. A mouse user never noticed; a remote has nothing to
   * press. This asks the same resolver that route entry uses, so
   * `data-nav-first` means the same thing on a modal as it does on a page, and
   * falls back to the spacer rather than to nothing.
   */
  const initialFocus = useCallback(() => {
    const el = wrapperRef.current;
    if (el === null) return spacerRef.current ?? false;
    return resolveEntryPoint(el) ?? spacerRef.current ?? false;
  }, []);

  // Register the wrapper as the innermost focus scope while it's up, so
  // directional navigation can tell it's inside a modal. Read-only bookkeeping
  // — it doesn't move focus, and focus-trap stays in charge of that.
  //
  // Tied to `show` as well as to the element, because the wrapper lingers for
  // the 200ms leave transition and a closing overlay no longer owns anything.
  // That's the same moment the trap below deactivates.
  //
  // Releasing the scope is only half of it. For the length of that leave
  // transition the scope is gone but the DOM is not, so `collectFocusables`
  // still returns every control of a modal that is fading out, with nothing
  // left to say they belong to it — measured at ~200ms and eighteen controls
  // on the keyboard-shortcuts modal. Navigation would walk into a dying
  // dialog, and focus recovery would do the same while trying to rescue
  // focus; both look like "focus disappeared". So the wrapper is marked as
  // soon as it stops owning focus, in the same effect, and the engine skips
  // the subtree. With no engine running this is an unread attribute.
  useEffect(() => {
    if (!wrapper) return;
    if (!props.show) {
      wrapper.setAttribute("data-nav-skip", "");
      return;
    }
    wrapper.removeAttribute("data-nav-skip");
    return pushScope(wrapper);
  }, [props.show, wrapper]);

  useEffect(() => {
    const element = ref.current?.closest(".popout-location");
    setPortalElement(element ?? document.body);
  }, []);

  // Ensure the DOM is ready before enabling the focus trap — counted from when
  // the overlay is *shown*, not from when it mounts. Almost every modal here is
  // mounted with `show` false and stays that way for the whole session, so a
  // timer tied to mount had fired long before the thing ever opened: the trap
  // then armed in the same commit as `show`, ahead of the pass on which
  // Headless UI mounts the wrapper it is supposed to be trapping. Nothing was
  // there yet to give focus to, which is how `initialFocus` below ended up
  // resolving to the placeholder spacer instead of the dialog's own content.
  useEffect(() => {
    if (!props.show) {
      setIsReady(false);
      return;
    }
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, [props.show]);

  // Add global error handler for unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (
        event.reason &&
        typeof event.reason === "object" &&
        "message" in event.reason
      ) {
        const message = event.reason.message;
        if (
          message &&
          typeof message === "string" &&
          message.includes("matches.call")
        ) {
          console.warn(
            "Caught focus-trap matches.call error, preventing crash:",
            event.reason,
          );
          event.preventDefault();
        }
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () =>
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
  }, []);

  return (
    <div ref={ref}>
      {portalElement
        ? createPortal(
            <Transition show={props.show} animation="none">
              <FocusTrap
                active={isReady && !!props.show}
                focusTrapOptions={{
                  allowOutsideClick: true,
                  clickOutsideDeactivates: true,
                  initialFocus,
                  fallbackFocus: () => document.body,
                  returnFocusOnDeactivate: true,
                  escapeDeactivates: false, // Let our keyboard handler manage escape
                  preventScroll: true,
                  // Disable the problematic check that causes the matches.call error
                  checkCanFocusTrap: () => Promise.resolve(),
                }}
              >
                {/* focus-trap-react clones this child to attach its own ref
                    and forwards to ours, so both get the element. */}
                <div
                  ref={setWrapper}
                  className="popout-wrapper fixed overflow-hidden pointer-events-auto inset-0 select-none"
                  style={{ zIndex }}
                >
                  <Transition animation="fade" isChild>
                    <div
                      onClick={close}
                      className={classNames({
                        "absolute inset-0": true,
                        "bg-black opacity-90": props.darken,
                      })}
                    />
                  </Transition>
                  <Transition
                    animation="slide-up"
                    className="absolute inset-0 pointer-events-none"
                    isChild
                    durationClass={props.durationClass ?? "duration-200"}
                  >
                    {/* a tabable index that does nothing - used so focus trap doesn't error when nothing is rendered yet */}
                    {/* tabIndex must stay 0: a positive value hoists this
                        spacer ahead of the entire document's tab order, which
                        it does whenever the portal is mounted but the trap
                        isn't armed yet (see the 100ms delay above) or is
                        deactivating. 0 keeps it tabbable for focus-trap
                        without the hoist. */}
                    <div
                      ref={spacerRef}
                      tabIndex={0}
                      className="focus:ring-0 focus:outline-none opacity-0"
                    />
                    {props.children}
                  </Transition>
                </div>
              </FocusTrap>
            </Transition>,
            portalElement,
          )
        : null}
    </div>
  );
}

export function Overlay(props: OverlayProps) {
  const router = useInternalOverlayRouter(props.id);
  const realClose = router.close;

  // listen for anchor updates
  useRouterAnchorUpdate(props.id);

  const close = useCallback(() => {
    realClose();
  }, [realClose]);

  return (
    <OverlayPortal
      close={close}
      show={router.isOverlayActive()}
      darken={props.darken}
    >
      {props.children}
    </OverlayPortal>
  );
}
