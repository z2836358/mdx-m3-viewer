import UnitsDoo from '../unitsdoo/file';
import Unit from '../unitsdoo/unit';
import JassContext from './context';
import JassUnit from './types/unit';

/**
 * @param {War3Map} map
 * @param {string} commonj
 * @param {string} blizzardj
 * @param {function} callback
 */
export default function rebuild(map, commonj, blizzardj, callback) {
  let jass = new JassContext(map);
  let start = performance.now();

  function time(msg) {
    callback(`[${(performance.now() - start) | 0}] ${msg}`);
  }

  //jass.debugMode = true;

  time('Parsing common.j');
  let commonjJs = jass.recompile(commonj);
  time('Running common.j');
  jass.run(commonjJs);

  time('Parsing Blizzard.j');
  let blizzardjJs = jass.recompile(blizzardj);
  time('Running Blizzard.j');
  jass.run(blizzardjJs);

  time('Parsing war3map.j');
  let scriptJs = jass.recompile(jass.map.getScript());
  time('Running war3map.j');
  jass.run(scriptJs);

  // jass.addEventListener('nativedef', (e) => console.log(e));
  // jass.addEventListener('functiondef', (e) => console.log(e));
  // jass.addEventListener('localvardef', (e) => console.log(e));
  // jass.addEventListener('globalvardef', (e) => console.log(e));
  // jass.addEventListener('varset', (e) => console.log(e));
  // jass.addEventListener('arrayvarset', (e) => console.log(e));
  // jass.addEventListener('varget', (e) => console.log(e));
  // jass.addEventListener('arrayvarget', (e) => console.log(e));
  // jass.addEventListener('handlecreated', (e) => console.log(e));
  // jass.addEventListener('handledestroyed', (e) => console.log(e));
  // jass.addEventListener('refcreated', (e) => console.log(e));
  // jass.addEventListener('refdestroyed', (e) => console.log(e));
  // jass.addEventListener('call', (e) => console.log(e));

  time('Running config()');
  jass.call('config');

  time('Running main()');
  jass.call('main');

  time('Collecting handles');

  let unitsFile = new UnitsDoo();
  let units = unitsFile.units;

  for (let handle of jass.handles) {
    if (handle instanceof JassUnit) {
      let unit = new Unit();

      unit.id = handle.id;

      unit.location[0] = handle.location.x;
      unit.location[1] = handle.location.y;
      // For z need the height of the terrain!

      unit.angle = handle.face / 180 * Math.PI;

      unit.player = handle.player.index;

      unit.targetAcquisition = handle.acquireRange;

      units.push(unit);
    }
  }

  time(`Saving war3mapUnits.doo with ${units.length} objects`);

  map.set('war3mapUnits.doo', unitsFile.save());

  time('Finished');
}
