import { Panel } from "@/components/common/Panel";
import { SAFETY_DISCLAIMER } from "@/lib/constants";

/** What the prototype is, what it is not, and whose work it builds on. No results are quoted here. */
export function About() {
  return (
    <main className="about">
      <Panel title="About CardioScope AI">
        <p>
          CardioScope AI takes routine clinical, laboratory, ECG and echocardiography measurements and shows four
          model predictions: coronary artery disease (CAD) and stenosis of the LAD, LCX and RCA coronary arteries.
          Each prediction comes with an explanation of which inputs moved the model’s output, and the three vessel
          predictions are shown on an interactive 3D view of the heart.
        </p>
        <p className="about__note">{SAFETY_DISCLAIMER}</p>
      </Panel>
      <div className="about__grid">
        <Panel title="What to keep in mind">
          <ul className="about__list">
            <li>Outputs are model predictions from clinical features, not diagnoses.</li>
            <li>The models were trained on one small, single-centre public dataset and have not been validated elsewhere.</li>
            <li>The four models differ in quality. Read the Model page before relying on any output.</li>
            <li>The 3D anatomy is generic. Vessel colour shows model output and does not locate a lesion.</li>
            <li>Explanations describe the model’s behaviour. They are not causes of disease.</li>
            <li>What-if simulation shows model sensitivity, not the effect of treating a patient.</li>
            <li>Do not enter real patient data. Nothing is stored, and there is no sign-in.</li>
          </ul>
        </Panel>
        <Panel title="Sources and credits">
          <ul className="about__list">
            <li>Data: Z-Alizadeh Sani dataset and its extension, UCI Machine Learning Repository.</li>
            <li>Heart, vessels and body outline: BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 Japan.</li>
            <li>Nervous system, skeleton and organs: Z-Anatomy, CC BY-SA 4.0.</li>
            <li>Typeface: Source Sans 3, SIL Open Font License.</li>
            <li>Developed by Jeevana Nanepalli. Source code under the MIT License.</li>
          </ul>
        </Panel>
      </div>
    </main>
  );
}
