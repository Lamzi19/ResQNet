package org.resqnet.sos.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// ResQNet uses an emergency high-contrast dark theme by default
private val DarkColorScheme = darkColorScheme(
    primary = ResQNetRed,
    onPrimary = ResQNetTextPrimary,
    primaryContainer = ResQNetRedDark,
    onPrimaryContainer = ResQNetTextPrimary,
    secondary = ResQNetCyan,
    onSecondary = ResQNetTextPrimary,
    background = ResQNetDarkBg,
    onBackground = ResQNetTextPrimary,
    surface = ResQNetSurface,
    onSurface = ResQNetTextPrimary,
    surfaceVariant = ResQNetSurfaceVariant,
    onSurfaceVariant = ResQNetTextSecondary,
    outline = ResQNetBorder
)

@Composable
fun ResQNetSosTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = DarkColorScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window
            window?.let {
                it.statusBarColor = colorScheme.background.toArgb()
                it.navigationBarColor = colorScheme.background.toArgb()
                WindowCompat.getInsetsController(it, view).isAppearanceLightStatusBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
