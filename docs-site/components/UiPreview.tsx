/**
 * A small product UI — page, card, text, link, button, card shadow — painted
 * with a demo theme. Follows the reader's appearance by default; pin
 * `scheme` for a static rendering (as `SchemeGrid` does).
 *
 * Any theme works as long as `roles` maps each part to one of its colors.
 */

import { tasty } from '@tenphi/cookbook/styling';
import { UI_DEMO, UI_ROLES } from './demo-themes';
import type { UiRoles } from './demo-themes';
import { SCHEMES, paint, resolveDemo } from './glaze-docs';
import type {
  DemoTheme,
  ResolvedDemo,
  SchemeChoice,
  SchemeColors,
} from './glaze-docs';

const Page = tasty({
  styles: {
    display: 'grid',
    padding: '2.5x',
    radius: '$card-radius',
    border: '1bw solid #border',
  },
});

const Card = tasty({
  styles: {
    display: 'grid',
    gap: '1x',
    padding: '2x',
    radius: '1r',
  },
});

const Text = tasty({ as: 'span', styles: { preset: 'body' } });
const Title = tasty({
  as: 'span',
  styles: { preset: 'h5', margin: '0' },
});
const Small = tasty({ as: 'span', styles: { preset: 'small' } });

const Row = tasty({
  styles: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.5x',
    alignItems: 'center',
    marginTop: '1x',
  },
});

const Button = tasty({
  as: 'span',
  styles: {
    display: 'inline-flex',
    padding: '0.75x 1.5x',
    radius: '1r',
    preset: 'small',
    fontWeight: 600,
  },
});

/** A box-shadow per scheme, colored by a resolved shadow token. */
function boxShadow(c: SchemeColors): SchemeColors {
  const out = {} as SchemeColors;
  for (const s of SCHEMES) out[s] = `0 0.75rem 1.75rem -0.25rem ${c[s]}`;
  return out;
}

export interface UiPreviewProps extends Partial<DemoTheme> {
  roles?: Partial<UiRoles>;
  scheme?: SchemeChoice;
  /** Pre-resolved theme, to share one resolve across several previews. */
  demo?: ResolvedDemo;
}

export default function UiPreview(props: UiPreviewProps) {
  const scheme = props.scheme ?? 'auto';
  const roles = { ...UI_ROLES, ...props.roles };
  const demo =
    props.demo ??
    resolveDemo({
      ...UI_DEMO,
      ...(props.hue !== undefined ? { hue: props.hue } : {}),
      ...(props.saturation !== undefined
        ? { saturation: props.saturation }
        : {}),
      darkHue: props.darkHue,
      darkSaturation: props.darkSaturation,
      config: props.config,
      colors: props.colors ?? UI_DEMO.colors,
    });
  const c = (name: string) => paint(demo.colors[name], scheme);

  return (
    <Page styles={{ fill: c(roles.page) }} data-not-content="">
      <Card
        styles={{
          fill: c(roles.card),
          border: '1bw solid',
          borderColor: c(roles.border),
          ...(roles.shadow && demo.colors[roles.shadow]
            ? { shadow: paint(boxShadow(demo.colors[roles.shadow]), scheme) }
            : {}),
        }}
      >
        <Small styles={{ color: c(roles.textSoft) }}>Quarterly report</Small>
        <Title styles={{ color: c(roles.text) }}>Revenue is up 12%</Title>
        <Text styles={{ color: c(roles.textSoft) }}>
          Every color on this card was resolved by Glaze for the scheme you are
          viewing.
        </Text>
        <Row>
          <Button
            styles={{ fill: c(roles.accent), color: c(roles.accentLabel) }}
          >
            Publish
          </Button>
          <Small
            styles={{
              color: c(roles.link),
              fontWeight: 600,
              textDecoration: 'underline',
            }}
          >
            View details
          </Small>
        </Row>
      </Card>
    </Page>
  );
}
