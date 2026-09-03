import { Scale, STANDARD_SPAN } from "./components/Scale.tsx";

export default function App() {
  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <h1 className="masthead__title">
            DIY <span>Design</span> Compiler
          </h1>
          <p className="masthead__tagline">
            寸法と手持ちの材料を、部材・木取り・組立手順へコンパイルする
          </p>
        </div>
        <div className="masthead__scale">
          <Scale span={STANDARD_SPAN} labels />
        </div>
      </header>

      <main className="layout">
        <div className="rail">
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">入力</h2>
            </div>
            <div className="panel__body">
              <p className="empty">準備中</p>
            </div>
          </section>
        </div>
        <div className="stage">
          <p className="empty">準備中</p>
        </div>
      </main>
    </>
  );
}
