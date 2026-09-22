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
      return ["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height,
              "scaleX": frame.width / max(view.bounds.width, 1),
              "scaleY": frame.height / max(view.bounds.height, 1)]
    }.runOnQueue(.main)

    AsyncFunction("setSheetHeightAsync") { (tag: Int, height: Double?, animated: Bool) -> Bool in
      guard let view = self.appContext?.findView(withTag: tag, ofType: UIView.self) else { return false }
      var responder: UIResponder? = view
      while let current = responder {
        if let controller = current as? UIViewController,
           let sheet = controller.sheetPresentationController,
           controller.presentingViewController != nil {
          let update = {
            if let height {
              let identifier = UISheetPresentationController.Detent.Identifier("tabitomoCompact")
              sheet.detents = [.custom(identifier: identifier) { context in
                min(CGFloat(height), context.maximumDetentValue)
              }]
              sheet.selectedDetentIdentifier = identifier
            } else {
              sheet.detents = [.large()]
              sheet.selectedDetentIdentifier = .large
            }
            sheet.prefersScrollingExpandsWhenScrolledToEdge = false
          }
          if animated { sheet.animateChanges(update) } else { update() }
          return true
        }
        responder = current.next
      }
      return false
    }.runOnQueue(.main)
  }
}
