"use client";

import styled from "styled-components";
import { StrokeText } from "./StrokeText";

/** A little 3D bird, circling forever. `label` sits under the scene so every
 * call site's own message (24 of them across the app) still shows through
 * this animation instead of a generic one. The whole scene is built in fixed
 * pixel values (it's a hand-tuned 3D construction), so full/inline sizing is
 * done with a wrapper `transform: scale(...)` rather than touching any of
 * the internal geometry. */
const StyledWrapper = styled.div<{ $full: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  ${(p) => (p.$full ? "min-height: 80vh;" : "padding-block: 3rem;")}

  .bird-scene {
    width: 100%;
    height: ${(p) => (p.$full ? "460px" : "260px")};
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .bird-scene #sky {
    margin-top: -60px;
    perspective: 400px;
    filter: drop-shadow(0px 150px 10px rgba(0, 0, 0, 0.2));
    transform: scale(${(p) => (p.$full ? 1.4 : 0.75)});
  }

  @-moz-document url-prefix() {
    .bird-scene #sky {
      filter: none;
    }
  }

  .bird-scene #sky div {
    transform-style: preserve-3d;
  }

  .bird-scene #sky .bird {
    animation: fly 10000ms linear infinite;
  }

  .bird-scene #sky .bird .wind {
    position: absolute;
    left: 50%;
    width: 4px;
    height: 200px;
    margin-left: -2px;
    border-radius: 999px;
    overflow: hidden;
  }

  .bird-scene #sky .bird .wind::before {
    content: "";
    position: absolute;
    width: 4px;
    height: 300px;
    background: rgba(100, 200, 255, 0.3);
    border-radius: 999px;
    transform: translateY(-300px);
    animation: wind linear infinite;
  }

  /* WIND POSITIONS + ANIMATIONS */

  .bird-scene #sky .bird .wind:nth-child(1) {
    transform: translate3d(-189px, -89px, -2px) rotateY(90deg);
  }
  .bird-scene #sky .bird .wind:nth-child(1)::before {
    animation-duration: 2627ms;
    animation-delay: 2771ms;
  }

  .bird-scene #sky .bird .wind:nth-child(2) {
    transform: translate3d(-58px, -129px, -80px) rotateY(90deg);
  }
  .bird-scene #sky .bird .wind:nth-child(2)::before {
    animation-duration: 2252ms;
    animation-delay: 3754ms;
  }

  .bird-scene #sky .bird .wind:nth-child(3) {
    transform: translate3d(-17px, 123px, 68px) rotateY(90deg);
  }
  .bird-scene #sky .bird .wind:nth-child(3)::before {
    animation-duration: 1401ms;
    animation-delay: 1423ms;
  }

  .bird-scene #sky .bird .wind:nth-child(4) {
    transform: translate3d(28px, 41px, -9px) rotateY(90deg);
  }
  .bird-scene #sky .bird .wind:nth-child(4)::before {
    animation-duration: 1922ms;
    animation-delay: 2218ms;
  }

  .bird-scene #sky .bird .wind:nth-child(5) {
    transform: translate3d(144px, -91px, -87px) rotateY(90deg);
  }
  .bird-scene #sky .bird .wind:nth-child(5)::before {
    animation-duration: 2054ms;
    animation-delay: 4654ms;
  }

  .bird-scene #sky .bird .wind:nth-child(6) {
    transform: translate3d(-163px, -29px, 0px) rotateY(90deg);
  }
  .bird-scene #sky .bird .wind:nth-child(6)::before {
    animation-duration: 2231ms;
    animation-delay: 3433ms;
  }

  .bird-scene #sky .bird .wind:nth-child(7) {
    transform: translate3d(4px, -10px, -54px) rotateY(90deg);
  }
  .bird-scene #sky .bird .wind:nth-child(7)::before {
    animation-duration: 2403ms;
    animation-delay: 1893ms;
  }

  .bird-scene #sky .bird .wind:nth-child(8) {
    transform: translate3d(149px, -1px, -5px) rotateY(90deg);
  }
  .bird-scene #sky .bird .wind:nth-child(8)::before {
    animation-duration: 1235ms;
    animation-delay: 1648ms;
  }

  .bird-scene #sky .bird .wind:nth-child(9) {
    transform: translate3d(7px, -15px, 81px) rotateY(90deg);
  }
  .bird-scene #sky .bird .wind:nth-child(9)::before {
    animation-duration: 1299ms;
    animation-delay: 2924ms;
  }

  .bird-scene #sky .bird .wind:nth-child(10) {
    transform: translate3d(103px, 149px, 51px) rotateY(90deg);
  }
  .bird-scene #sky .bird .wind:nth-child(10)::before {
    animation-duration: 1216ms;
    animation-delay: 1183ms;
  }

  .bird-scene #sky .bird_body {
    position: relative;
    width: 30px;
    height: 40px;
    background: rgb(126, 109, 201);
  }

  .bird-scene #sky .bird_head {
    position: absolute;
    top: -30px;
    border-right: 15px solid transparent;
    border-bottom: 30px solid rgb(165, 105, 241);
    border-left: 15px solid transparent;
    transform-origin: 50% 100%;
    transform: rotateX(-20deg);
  }

  .bird-scene #sky .bird_wing_left {
    position: absolute;
    left: -30px;
    height: 30px;
    border-right: 30px solid rgb(149, 147, 221);
    border-bottom: 10px solid transparent;
    transform-origin: 100% 0;
    animation: wingLeft 1000ms cubic-bezier(0.36, 0.1, 0.16, 1) infinite alternate;
  }

  .bird-scene #sky .bird_wing_left_top {
    position: absolute;
    left: -30px;
    border-right: 30px solid rgb(129, 133, 229);
    border-bottom: 30px solid transparent;
    transform-origin: 100% 0;
    animation: wingLeft 1000ms cubic-bezier(0.545, 0.08, 0.52, 0.975) infinite alternate;
  }

  .bird-scene #sky .bird_wing_right {
    position: absolute;
    left: 30px;
    height: 30px;
    border-left: 30px solid rgb(121, 164, 239);
    border-bottom: 10px solid transparent;
    transform-origin: 0 0;
    animation: wingRight 1000ms cubic-bezier(0.36, 0.1, 0.16, 1) infinite alternate;
  }

  .bird-scene #sky .bird_wing_right_top {
    position: absolute;
    border-left: 30px solid rgb(130, 138, 241);
    border-bottom: 30px solid transparent;
    transform-origin: 0 0;
    animation: wingRight 1000ms cubic-bezier(0.545, 0.08, 0.52, 0.975) infinite alternate;
  }

  .bird-scene #sky .bird_tail_left {
    position: absolute;
    top: 40px;
    border-right: 30px solid transparent;
    border-top: 40px solid rgb(119, 170, 244);
    transform-origin: 50% 0;
    transform: rotateX(-20deg);
  }

  .bird-scene #sky .bird_tail_right {
    position: absolute;
    top: 40px;
    border-left: 30px solid transparent;
    border-top: 40px solid rgb(194, 115, 248);
    transform-origin: 50% 0;
    transform: rotateX(-20deg);
  }

  /* ANIMATIONS */

  @keyframes fly {
    0% {
      transform: rotateX(-120deg) rotateZ(0deg) rotateX(10deg);
    }

    100% {
      transform: rotateX(-120deg) rotateZ(360deg) rotateX(10deg);
    }
  }

  @keyframes wingLeft {
    0% {
      transform: rotateY(-40deg);
    }

    100% {
      transform: rotateY(40deg);
    }
  }

  @keyframes wingRight {
    0% {
      transform: rotateY(40deg);
    }

    100% {
      transform: rotateY(-40deg);
    }
  }

  @keyframes wind {
    0% {
      transform: translateY(-300px);
    }

    100% {
      transform: translateY(200px);
    }
  }
`;

export function Loader({ label = "Loading…", full = false }: { label?: string; full?: boolean }) {
  return (
    <StyledWrapper $full={full}>
      <div className="bird-scene">
        <div id="sky">
          <div className="bird">
            <div className="wind" />
            <div className="wind" />
            <div className="wind" />
            <div className="wind" />
            <div className="wind" />
            <div className="wind" />
            <div className="wind" />
            <div className="wind" />
            <div className="wind" />
            <div className="wind" />
            <div className="bird_body">
              <div className="bird_head" />
              <div className="bird_wing_left">
                <div className="bird_wing_left_top" />
              </div>
              <div className="bird_wing_right">
                <div className="bird_wing_right_top" />
              </div>
              <div className="bird_tail_left" />
              <div className="bird_tail_right" />
            </div>
          </div>
        </div>
      </div>
      <StrokeText
        key={label}
        text={label}
        fontSize={full ? 16 : 12}
        strokeColor="#8185E5"
        fillColor="#6b5fb8"
        strokeWidth={0.6}
        duration={full ? 1.4 : 1}
        trigger="mount"
        className="max-w-full"
      />
    </StyledWrapper>
  );
}
