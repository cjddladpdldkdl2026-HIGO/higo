/* ============================================================================
 * bones.js — 3D bone library for the stage mode (bone3d.js)
 * Every mesh is BodyParts3D (© 2008 DBCLS, CC BY-SA 2.1 JP), converted to a
 * compact indexed mesh in assets/*.bin. Coordinates are the meshes' own (mm):
 * −x = patient's right / lateral for right-side bones, +y = posterior,
 * +z = superior. `p` is the landmark position, `face` the direction (same
 * axes) the bone turns toward the camera when that landmark is asked.
 * Stages run in the order of STAGES.
 *
 * Korean names follow the KMA medical terminology (의학용어집 6th ed., via the
 * KMA dictionary on KMLE): the Korean term first, with the KMA-listed
 * Sino-Korean term in parentheses where one exists. Terms the KMA dictionary
 * doesn't list on their own (e.g. 가시위오목) use the Korean Association of
 * Anatomists' terms.
 * ========================================================================== */

const SCAPULA = {
  id: 'scapula', name: 'Scapula', ko: '어깨뼈 (견갑골)',
  mesh: 'assets/scapula-right.bin',
  landmarks: [
    { name: 'Acromion',              ko: '어깨뼈봉우리 (견봉)',       p: [-168.5, -54.9, 1355.6], face: [-0.6, 0.5, 0.6] },
    { name: 'Coracoid process',      ko: '부리돌기',    p: [-131.9, -99.1, 1334.0], face: [-0.3, -1, 0.3] },
    { name: 'Glenoid cavity',        ko: '관절오목',     p: [-151.9, -53.4, 1312.3], face: [-1, -0.25, 0] },
    { name: 'Infraglenoid tubercle', ko: '접시아래결절 (관절하결절)', p: [-143.8, -52.9, 1298.0], face: [-1, 0.3, -0.15] },
    { name: 'Suprascapular notch',   ko: '어깨뼈패임 (견갑골절흔)',  p: [-105.7, -41.8, 1330.1], face: [0.1, -0.5, 1] },
    { name: 'Superior angle',        ko: '위각',         p: [-80.8, -23.3, 1352.1],  face: [0.3, 1, 0.35] },
    { name: 'Inferior angle',        ko: '아래각',       p: [-91.2, 0.0, 1201.5],    face: [0, 1, -0.2] },
    { name: 'Medial border',         ko: '안쪽모서리',   p: [-59.6, 1.7, 1285.6],    face: [0.35, 1, 0] },
    { name: 'Lateral border',        ko: '가쪽모서리',   p: [-120.9, -20.4, 1254.9], face: [-0.55, 1, 0] },
    { name: 'Spine of scapula',      ko: '어깨뼈가시',     p: [-102.0, -4.3, 1320.7],  face: [0, 1, 0.3] },
    { name: 'Root of spine',         ko: '어깨뼈가시뿌리',  p: [-63.8, 1.1, 1308.2],    face: [0.25, 1, 0] },
    { name: 'Supraspinous fossa',    ko: '가시위오목',   p: [-86.6, -24.5, 1331.3],  face: [0, 1, 0.6] },
    { name: 'Infraspinous fossa',    ko: '가시아래오목', p: [-90.2, -5.5, 1271.2],   face: [0, 1, 0] },
    { name: 'Subscapular fossa',     ko: '어깨뼈밑오목 (견갑하와)',  p: [-99.2, -16.3, 1278.8],  face: [0, -1, 0] },
  ],
};

const HUMERUS = {
  id: 'humerus', name: 'Humerus', ko: '위팔뼈 (상완골)',
  mesh: 'assets/humerus-right.bin',
  landmarks: [
    { name: 'Head of humerus',          ko: '위팔뼈머리',     p: [-148.1, -64.8, 1339.6], face: [0.6, 0.3, 0.6] },
    { name: 'Greater tubercle',         ko: '큰결절',         p: [-190.1, -77.3, 1302.1], face: [-1, -0.4, 0.2] },
    { name: 'Lesser tubercle',          ko: '작은결절',       p: [-164.2, -95.7, 1319.9], face: [0.1, -1, 0.2] },
    { name: 'Intertubercular sulcus',   ko: '결절사이고랑 (결절간구)', p: [-175.0, -84.4, 1301.2], face: [0, -1, 0.1] },
    { name: 'Surgical neck',            ko: '외과목',         p: [-194.7, -73.9, 1272.3], face: [-1, -0.4, 0] },
    { name: 'Deltoid tuberosity',       ko: '세모근거친면',   p: [-208.1, -68.4, 1183.5], face: [-1, -0.2, 0] },
    { name: 'Medial epicondyle',        ko: '안쪽위관절융기', p: [-178.3, -64.2, 1058.9], face: [0.5, -0.8, 0] },
    { name: 'Lateral epicondyle',       ko: '가쪽위관절융기', p: [-241.6, -57.3, 1064.4], face: [-0.6, -0.8, 0] },
    { name: 'Capitulum',                ko: '위팔뼈작은머리 (상완골소두)',     p: [-218.4, -74.9, 1056.3], face: [-0.2, -1, -0.2] },
    { name: 'Trochlea',                 ko: '위팔뼈도르래',       p: [-198.2, -66.5, 1039.7], face: [0.2, -1, -0.4] },
    { name: 'Olecranon fossa',          ko: '팔꿈치오목 (주두와)',   p: [-213.3, -54.9, 1072.7], face: [0, 1, 0] },
    { name: 'Coronoid fossa',           ko: '갈고리오목 (구돌와)',   p: [-200.6, -72.5, 1064.2], face: [0, -1, 0] },
  ],
};

// Right hand, palm facing anterior (−y). Each target sits on a whole bone.
const PALM = [0, -1, 0.15], THUMB = [-0.45, -1, 0.1];
const hand = (name, ko, p, face = PALM) => ({ name, ko, p, face });
const HAND = {
  id: 'hand', name: 'Hand', ko: '손뼈',
  mesh: 'assets/hand-right.bin',
  targetScale: 0.85,  // small, tightly packed bones
  landmarks: [
    hand('Scaphoid',   '손배뼈 (주상골)',   [-262.2, -114.6, 814.7]),
    hand('Lunate',     '반달뼈 (월상골)',   [-246.2, -114.3, 813.4]),
    hand('Triquetrum', '세모뼈',     [-237.6, -119.1, 805.8]),
    hand('Pisiform',   '콩알뼈 (두상골)',   [-236.7, -128.9, 805.8]),
    hand('Trapezium',  '큰마름뼈',   [-273.7, -123.2, 807.0], THUMB),
    hand('Trapezoid',  '작은마름뼈', [-267.5, -116.9, 799.7]),
    hand('Capitate',   '알머리뼈',   [-256.9, -115.4, 802.8]),
    hand('Hamate',     '갈고리뼈',   [-245.8, -116.9, 799.8]),
    hand('1st metacarpal', '첫째손허리뼈 (중수골)', [-293.6, -136.2, 787.2], THUMB),
    hand('2nd metacarpal', '둘째손허리뼈', [-277.9, -126.7, 763.8]),
    hand('3rd metacarpal', '셋째손허리뼈', [-263.2, -123.9, 762.9]),
    hand('4th metacarpal', '넷째손허리뼈', [-248.8, -124.7, 764.3]),
    hand('5th metacarpal', '다섯째손허리뼈', [-235.5, -128.8, 766.8]),
    hand('Proximal phalanx of thumb',  '엄지손가락 첫마디뼈',     [-309.4, -150.0, 762.4], THUMB),
    hand('Distal phalanx of thumb',    '엄지손가락 끝마디뼈',     [-317.4, -161.9, 742.2], THUMB),
    hand('Proximal phalanx of index',  '집게손가락 첫마디뼈',     [-293.3, -141.8, 717.0]),
    hand('Middle phalanx of index',    '집게손가락 중간마디뼈',   [-302.1, -157.5, 692.0]),
    hand('Distal phalanx of index',    '집게손가락 끝마디뼈',     [-307.3, -174.3, 679.5]),
    hand('Proximal phalanx of middle', '가운데손가락 첫마디뼈',   [-270.0, -146.2, 715.8]),
    hand('Middle phalanx of middle',   '가운데손가락 중간마디뼈', [-274.3, -165.6, 686.3]),
    hand('Distal phalanx of middle',   '가운데손가락 끝마디뼈',   [-277.2, -182.4, 670.9]),
    hand('Proximal phalanx of ring',   '반지손가락 첫마디뼈',     [-248.6, -145.2, 721.4]),
    hand('Middle phalanx of ring',     '반지손가락 중간마디뼈',   [-250.1, -164.7, 692.7]),
    hand('Distal phalanx of ring',     '반지손가락 끝마디뼈',     [-250.7, -182.4, 679.7]),
    hand('Proximal phalanx of little', '새끼손가락 첫마디뼈',     [-228.9, -145.8, 730.4]),
    hand('Middle phalanx of little',   '새끼손가락 중간마디뼈',   [-225.1, -159.6, 708.1]),
    hand('Distal phalanx of little',   '새끼손가락 끝마디뼈',     [-223.3, -172.3, 693.2]),
  ],
};

// Both hip bones + sacrum; questions are on the right hip bone.
const PELVIS = {
  id: 'pelvis', name: 'Pelvis', ko: '골반 · 볼기뼈 (관골)',
  mesh: 'assets/pelvis.bin',
  landmarks: [
    { name: 'Iliac crest',                     ko: '엉덩뼈능선 (장골능선)',   p: [-95.7, -72.8, 966.8],  face: [-0.3, -0.4, 1] },
    { name: 'Anterior superior iliac spine',   ko: '위앞엉덩뼈가시', p: [-116.0, -152.3, 901.2], face: [-0.4, -1, 0.2] },
    { name: 'Anterior inferior iliac spine',   ko: '아래앞엉덩뼈가시', p: [-95.2, -127.2, 860.7], face: [-0.5, -1, 0] },
    { name: 'Posterior superior iliac spine',  ko: '위뒤엉덩뼈가시', p: [-45.8, -13.8, 914.1],  face: [-0.2, 1, 0.3] },
    { name: 'Greater sciatic notch',           ko: '큰궁둥패임 (대좌골절흔)',   p: [-65.0, -65.1, 869.8],  face: [-0.8, 0.6, 0] },
    { name: 'Ischial spine',                   ko: '궁둥뼈가시 (좌골극)',   p: [-43.0, -46.8, 825.7],  face: [-0.5, 1, 0] },
    { name: 'Ischial tuberosity',              ko: '궁둥뼈결절 (좌골결절)',   p: [-46.2, -59.4, 759.6],  face: [-0.3, 0.7, -0.6] },
    { name: 'Acetabulum',                      ko: '절구 (비구)',         p: [-97.0, -101.0, 823.0], face: [-1, -0.3, 0] },
    { name: 'Obturator foramen',               ko: '폐쇄구멍 (폐쇄공)',     p: [-80.0, -94.0, 793.0],  face: [-0.5, -1, 0] },
    { name: 'Pubic tubercle',                  ko: '두덩뼈결절 (치골결절)',     p: [-15.1, -151.1, 810.0], face: [0, -1, 0.3] },
    { name: 'Pubic symphysis',                 ko: '두덩결합 (치골결합)',     p: [-3.5, -128.8, 804.0],  face: [0, -1, 0] },
    { name: 'Iliac fossa',                     ko: '엉덩뼈오목 (장골와)',   p: [-102.4, -104.6, 906.3], face: [0.5, -0.8, 0.5] },
  ],
};

// Sacrum with the coccygeal segments attached (as in the source mesh).
const SACRUM = {
  id: 'sacrum', name: 'Sacrum', ko: '엉치뼈 (천골)',
  mesh: 'assets/sacrum.bin',
  landmarks: [
    { name: 'Sacral promontory',           ko: '엉치뼈곶 (천골곶)',       p: [-0.2, -94.6, 903.8], face: [0, -1, 0.5] },
    { name: 'Base of sacrum',              ko: '엉치뼈바닥',       p: [9.0, -69.7, 920.2],  face: [0, -0.3, 1] },
    { name: 'Ala of sacrum',               ko: '엉치뼈날개',       p: [-48.7, -54.7, 931.9], face: [-0.2, -0.4, 1] },
    { name: 'Superior articular process',  ko: '위관절돌기',       p: [-26.3, -56.0, 934.4], face: [0, 0.8, 1] },
    { name: 'Auricular surface',           ko: '귀모양면',        p: [-60.2, -73.4, 902.7], face: [-1, 0, 0] },
    { name: 'Anterior sacral foramen',     ko: '앞엉치뼈구멍 (골반천추공)',   p: [-20.0, -38.0, 865.0], face: [0, -1, 0] },
    { name: 'Posterior sacral foramen',    ko: '뒤엉치뼈구멍',     p: [-17.6, -12.0, 866.0], face: [0, 1, 0] },
    { name: 'Median sacral crest',         ko: '정중엉치뼈능선',   p: [-0.2, -8.4, 865.0],  face: [0, 1, 0] },
    { name: 'Coccyx',                      ko: '꼬리뼈',           p: [-2.1, -27.3, 790.7], face: [0, -1, -0.3] },
  ],
};

export const STAGES = [SCAPULA, HUMERUS, HAND, PELVIS, SACRUM];

export const BONE_CREDIT = 'BodyParts3D © 2008 DBCLS · CC BY-SA 2.1 JP';
