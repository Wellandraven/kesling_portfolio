// Minimal stand-in for the component base the scene was authored against:
// gives HeroScene this.props, this.state and this.setState(), and notifies the UI on every change.
export class SceneBase {
  constructor(props = {}) {
    this.props = props;
    this.onStateChange = null;
  }
  setState(patch) {
    const p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    if (this.onStateChange) this.onStateChange(this.state);
  }
}
