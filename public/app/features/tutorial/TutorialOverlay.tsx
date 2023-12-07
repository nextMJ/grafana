import { css } from '@emotion/css';
import React, { useEffect, useRef, useState } from 'react';
import { usePopperTooltip } from 'react-popper-tooltip';
import { connect, ConnectedProps } from 'react-redux';

import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { StoreState, useDispatch } from 'app/types';

import { TutorialTooltip } from './TutorialTooltip';
import { nextStep } from './slice';
import { resolveRequiredActions, waitForElement } from './tutorialProvider.utils';

const spotlightOffset = 0;

const TutorialOverlayComponent = ({
  availableTutorials,
  currentTutorialId,
  currentStepIndex,
  stepTransition,
}: ConnectedProps<typeof connector>) => {
  const dispatch = useDispatch();
  const [showTooltip, setShowTooltip] = useState(false);
  const styles = useStyles2(getStyles);
  const [spotlightStyles, setSpotlightStyles] = useState({});
  const [canInteract, setCanInteract] = useState(false);
  const renderedFirstStep = useRef(false);
  const currentTutorial = availableTutorials.find((t) => t.id === currentTutorialId);
  const step = currentStepIndex !== null && currentTutorial ? currentTutorial.steps[currentStepIndex] : null;
  const isTransitioning = stepTransition === `transitioning`;

  const popper = usePopperTooltip({
    visible: showTooltip,
    placement: step ? step.placement : undefined,
    defaultVisible: false,
  });
  const { getTooltipProps, setTooltipRef, setTriggerRef, triggerRef } = popper;

  useEffect(() => {
    if (renderedFirstStep.current && !isTransitioning && currentTutorial) {
      setShowTooltip(false);

      // TODO: this could fire before the transitionend event. It is a fallback in case the transitionend event doesn't fire
      setTimeout(() => {
        setShowTooltip(true);
      }, 500);
    }
  }, [currentTutorial, isTransitioning]);

  useEffect(() => {
    let setStyles: any;
    let mouseMoveCallback: any;
    let scrollParent: Element | null;
    let transitionend: (e: TransitionEvent) => void;

    if (step && triggerRef) {
      waitForElement(step.target).then((element) => {
        setStyles = () =>
          new Promise((resolve) => {
            setSpotlightStyles(getSpotlightStyles(element));

            requestAnimationFrame(() => {
              resolve(true);
            });
          });

        mouseMoveCallback = (e: MouseEvent) => {
          if (triggerRef) {
            setCanInteract(isMouseOverSpotlight(e, triggerRef));
          }
        };

        transitionend = (e) => {
          // TODO: if there are multiple steps on the same element
          // with no transition the tooltip won't show
          if ([`width`, `height`, `top`, `left`].includes(e.propertyName)) {
            setShowTooltip(true);
          }
        };

        triggerRef.addEventListener(`transitionend`, transitionend);

        document.addEventListener('mousemove', mouseMoveCallback);
        scrollParent = element.closest('.scrollbar-view');
        setStyles().then(() => {
          if (step.requiredActions) {
            resolveRequiredActions(step.requiredActions).then(() => {
              dispatch(nextStep());
            });
          }

          if (!renderedFirstStep.current) {
            setShowTooltip(true);
            renderedFirstStep.current = true;
          }
        });
        scrollParent?.addEventListener('scroll', setStyles);
      });
    }

    return () => {
      scrollParent?.removeEventListener('scroll', setStyles);
      document.removeEventListener('mousemove', mouseMoveCallback);
      triggerRef?.removeEventListener(`transitionend`, transitionend);
    };
  }, [dispatch, step, triggerRef]);

  return (
    <>
      <div className={styles.container} id="tutorial" style={{ pointerEvents: canInteract ? `none` : `auto` }}>
        <div className={styles.spotlight} style={spotlightStyles} ref={setTriggerRef} />
      </div>
      {showTooltip && (
        <div ref={setTooltipRef} {...getTooltipProps()} className={styles.instructions}>
          <TutorialTooltip />
        </div>
      )}
    </>
  );
};

function getSpotlightStyles(node: Element) {
  const { top, left, width, height } = node.getBoundingClientRect();
  const leftOffset = left - spotlightOffset;
  const topOffset = top - spotlightOffset;

  return {
    left: `${leftOffset}px`,
    top: `${topOffset}px`,
    width: `${width}px`,
    height: `${height}px`,
  };
}

function isMouseOverSpotlight(mouseEvent: MouseEvent, spotlightElement: HTMLElement) {
  const { height, left, top, width } = spotlightElement.getBoundingClientRect();

  const offsetY = mouseEvent.pageY;
  const offsetX = mouseEvent.pageX;
  const inSpotlightHeight = offsetY >= top && offsetY <= top + height;
  const inSpotlightWidth = offsetX >= left && offsetX <= left + width;
  const inSpotlight = inSpotlightWidth && inSpotlightHeight;

  return inSpotlight;
}

// TODO: LEFT / TOP TRANSITION BUT NOT WHEN SCROLLING
const getStyles = (theme: GrafanaTheme2) => ({
  container: css({
    height: '100%',
    width: '100%',
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1058,
    mixBlendMode: 'hard-light',
  }),
  spotlight: css({
    backgroundColor: `#939393`,
    position: `absolute`,
    boxSizing: `content-box`,
    borderRadius: theme.shape.radius.default,
    transition: [`width`, `height`, `left`, `top`].map((prop) => `${prop} 0.2s ease-in-out`).join(', '),
    padding: spotlightOffset,
  }),
  instructions: css({
    display: `flex`,
    flexDirection: `column`,
    gap: theme.spacing(2),
    zIndex: 1059,
    width: `300px`,
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing(2),
    borderRadius: theme.shape.radius.default,
  }),
});

const mapStateToProps = (state: StoreState) => {
  return {
    ...state.tutorials,
  };
};

const connector = connect(mapStateToProps);

export const TutorialOverlay = connector(TutorialOverlayComponent);