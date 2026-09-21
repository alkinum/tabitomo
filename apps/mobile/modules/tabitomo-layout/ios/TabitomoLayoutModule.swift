import ExpoModulesCore
import UIKit

public final class TabitomoLayoutModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TabitomoLayout")

    AsyncFunction("getScreenFrameAsync") { (tag: Int) -> [String: Double]? in
      guard let view = self.appContext?.findView(withTag: tag, ofType: UIView.self),
            let window = view.window else { return nil }
      // Fabric's JS measurement is relative to the modal surface. Keyboard
      // notifications use screen coordinates, including the sheet's origin.
      let frame = view.convert(view.bounds, to: window.screen.coordinateSpace)
      return ["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height]
    }.runOnQueue(.main)
  }
}
