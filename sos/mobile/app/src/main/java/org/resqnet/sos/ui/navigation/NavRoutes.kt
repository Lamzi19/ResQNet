package org.resqnet.sos.ui.navigation

sealed class NavRoutes(val route: String) {
    object Home : NavRoutes("home")
    object SosForm : NavRoutes("sos_form")
    object SosHistory : NavRoutes("sos_history")
    object SafetyCheck : NavRoutes("safety_check")
}
